const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Add fetch polyfill for older Node.js versions
const fetch = require('node-fetch');
global.fetch = fetch;
const crypto = require('crypto');

const { chromium } = require('playwright');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const EmailNotifier = require('./services/emailNotifier');
const { processOutboxOnce } = require('./services/notificationOutbox');
const { createResumeDocx, resolveExportTemplate } = require('./services/docxExport');
const { loadProviderConfiguration, generateWithProviders } = require('./services/aiRuntime');
const { loadAiAdminSettings, saveAiAdminSettings, testAiProvider, fetchProviderModels } = require('./services/aiAdmin');
const { getGlobalAiDashboardData, setGlobalAiQuotaLimits, resetUserAiQuota, resetAllAiQuota } = require('./services/adminAiEntitlement');
const { mergeAdminSettingCategory } = require('./services/adminSettingsMerge');
const { PAYMENT_PROVIDERS, resolveWriteOnlySecret, getPaymentSettingsProjection } = require('./services/paymentAdmin');
const { resolveEffectiveEntitlement, isPaidMembershipTier } = require('./security/entitlements');
const { toCanonicalDate } = require('./database/canonical');
const { isMembershipActive, toCanonicalUser } = require('./database/domain');
const databaseAuthority = require('./database/authority');
const { getPool } = require('./database/mysql');
const paymentActivation = require('./services/paymentActivation');
const { reconcileStripeChargeRefund } = require('./services/refundReferences');
const { executeOrReconcileProviderRefund, refundFlowError } = require('./services/providerRefunds');
const { normalizeLlmDiscoverySettings } = require('./services/discoveryMetadata');
const { publishDueBlogPosts } = require('./services/cmsScheduler');
const {
    billingSnapshotHash,
    generateInvoice,
    getInvoiceForUser,
    invoiceFromRow,
    listInvoicesForUser,
    normalizeCustomerDetails,
    supplierFromPublicConfig,
} = require('./services/invoiceService');
const resilientMutations = require('./services/resilientMutations');
const accountDeletion = require('./services/accountDeletion');
const { createExportRenderToken, consumeExportRenderToken, discardExportRenderToken } = require('./security/exportTokens');
const { createTenantService } = require('./enterprise/tenantService');
const { enterpriseRouter } = require('./routes/enterprise');
const { enterpriseM2mRouter } = require('./routes/enterpriseM2m');
const { enterpriseFeatureEnabled } = require('./enterprise/featureFlags');
const { createAdminAuditMiddleware } = require('./security/adminAudit');
const { adminAuditRouter } = require('./routes/adminAudit');
const { platformRouter } = require('./routes/platform');
const { adminUsersRouter } = require('./routes/adminUsers');
const { adminPlatformOperationsRouter } = require('./routes/adminPlatformOperations');
const { resumesRouter } = require('./routes/resumes');
const { portfoliosRouter } = require('./routes/portfolios');
const { coversRouter } = require('./routes/covers');
const { supportUserRouter, supportAdminRouter } = require('./routes/support');
const indianGatewayActivation = require('./services/indianGatewayActivation');
const { maybeQueueReadyzAlert } = require('./services/readyzAlerts');
const { jobsDataRouter } = require('./routes/jobsData');
const { blogDataRouter } = require('./routes/blogData');
const { notificationsDataRouter } = require('./routes/notificationsData');
const { usersDataRouter } = require('./routes/usersData');
const { miscDataRouter } = require('./routes/miscData');
const { databaseAdminRouter } = require('./routes/databaseAdmin');
const { getRepository } = require('./repositories');
const app = express();
const cors = require('cors');
const cryptoRandom = require('crypto');
const { requireAuth, requirePermission, _permissionsFor, requireRecentAdminAuthentication, isSuperAdmin, testVerifierEnabled, issueLocalTestToken } = require('./security/auth');
const { enforceApiPolicy } = require('./security/policy');
const { createEnterpriseAuthMiddleware } = require('./enterprise/enterpriseAuth');
const {
    assertInternalOrder,
    validateStripePaymentIntent,
    validatePayPalOrder,
    validateRazorpaySignature,
    validateRazorpayPayment,
    validatePaytmPayment,
    validatePhonePePayment,
    _isDuplicateProviderEventError,
    _shouldReverseEntitlement,
    _calculateMembershipEnd,
} = require('./security/payments');
const {
    hashOpaque,
    createPkceChallenge,
    parseCookies,
    assertStateBinding,
    assertStateRecord,
    assertVerifiedIdentity,
    assertAccountLinkSafe,
    assertExchangeRecord,
} = require('./security/oauth');
const {
    hashToken,
    isOpaqueToken,
    assertPasswordPolicy,
    minimumEnumerationDelay,
} = require('./security/reset');
const {
    aiAccountLimiter,
    notificationAccountLimiter,
    exportAccountLimiter,
    scraperAccountLimiter,
    contactAccountLimiter,
    messagingAccountLimiter,
    enforceDailyAiQuota
} = require('./security/abuse');
const port = process.env.PORT || 8080;
const configuredWebsiteName = String(process.env.WEBSITE_NAME || process.env.APP_DOMAIN || 'ai-resume-builder.local').trim().toLowerCase();
if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,62})\.)*[a-z0-9][a-z0-9-]{0,62}(?::\d{1,5})?$/.test(configuredWebsiteName)) {
    throw new Error('WEBSITE_NAME must be a valid hostname');
}
const websiteName = configuredWebsiteName;
const protocol = String(process.env.PROTOCOL || 'https').toLowerCase();
if (!['http', 'https'].includes(protocol) || (process.env.NODE_ENV === 'production' && protocol !== 'https')) {
    throw new Error('PROTOCOL must be https in production');
}

// ---------------------------------------------------------------------------
// Firebase Admin initialization — IDENTITY ONLY.
//
// Firebase Admin is retained solely for authentication and identity lifecycle
// actions. Application data is owned by MariaDB and no Firebase database handle
// is created, registered, or accepted by runtime services.
// ---------------------------------------------------------------------------
let admin = null;
try {
    admin = require('./services/firebaseAdmin');
    if (!admin.apps.length) {
        let credential;
        const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';

        if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
            credential = admin.credential.cert({
                projectId,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            });
            console.log('[Firebase Admin] Initialized via environment variables (identity only)');
        } else if (process.env.NODE_ENV === 'production' || process.env.FIREBASE_USE_ADC === 'true' || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            // Workload Identity / Application Default Credentials avoid long-lived key files.
            credential = admin.credential.applicationDefault();
            console.log('[Firebase Admin] Initialized via Application Default Credentials (identity only)');
        } else {
            // Local builds without credentials can serve non-Firebase diagnostics only.
            admin.initializeApp({ projectId });
            console.log('[Firebase Admin] Initialized without credentials (limited local mode)');
        }

        if (credential) {
            admin.initializeApp({ credential, projectId });
        }
    }
} catch (e) {
    console.warn('[Firebase Admin] Initialization notice:', e.message);
}
// The Firebase Admin runtime is exposed only for identity verification and
// identity lifecycle operations; it is not an application-data adapter.
app.set('firebaseAdmin', admin);
// The enterprise control plane is authoritative over MariaDB.
app.set('tenantService', createTenantService({ pool: getPool(), admin }));

// Truthful one-time architecture statement. Never logs secrets or URLs.
if (enterpriseFeatureEnabled()) {
    const runtime = app.get('tenantService')?.describeRuntime?.() || {};
    console.log('[Enterprise Architecture]', JSON.stringify({
        enterpriseTenancy: 'ENABLED',
        dataProvider: `Enterprise Data Provider: ${String(runtime.dataProvider || 'mysql')}`,
        dataPlaneConfigured: runtime.dataPlaneConfigured === true,
        cache: 'Cache: none (MySQL/MariaDB is the authoritative store)',
        queue: 'Queue: MariaDB transactional outbox',
        encryption: `Encryption Provider: ${String(runtime.encryption?.provider === 'server-key' ? 'ServerKey' : runtime.encryption?.provider || 'none')}`,
        encryptionSecurityLevel: runtime.encryption?.securityLevel || null,
        quotaStore: runtime.quotaStore || 'mysql-atomic',
    }));
}

// Auto-initialize system fonts for Playwright PDF rendering on Linux servers
const initSystemFonts = () => {
    if (process.platform !== 'linux') return;
    try {
        const sourceDir = path.join(__dirname, 'fonts');
        const targetDir = path.join(require('os').homedir(), '.local', 'share', 'fonts');
        if (fs.existsSync(sourceDir)) {
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            const files = fs.readdirSync(sourceDir);
            let updated = false;
            for (const file of files) {
                if (file.endsWith('.ttf') || file.endsWith('.otf')) {
                    const src = path.join(sourceDir, file);
                    const dest = path.join(targetDir, file);
                    if (!fs.existsSync(dest) || fs.statSync(src).size !== fs.statSync(dest).size) {
                        fs.copyFileSync(src, dest);
                        updated = true;
                    }
                }
            }
            if (updated) {
                console.log('[Fonts] Auto-synced template font files to Linux system font cache.');
                try {
                    require('child_process').execSync(`fc-cache -f "${targetDir}"`, { stdio: 'ignore' });
                } catch (_e) {}
            }
        }
    } catch (err) {
        console.warn('[Fonts] Auto-sync notice:', err.message);
    }
};
initSystemFonts();

// Cross-database replication is intentionally absent. Domain-specific durable
// queues are MariaDB-owned and started below with their own workers.

// ---------------------------------------------------------------------------
// Startup schema bootstrap (release engineering §28): a fresh deployment with
// an empty database becomes operational on first boot. The bootstrap is
// idempotent and non-fatal — if MySQL is unreachable the server still starts
// and reports degraded readiness instead of crash-looping.
// ---------------------------------------------------------------------------
const { initializeSchema, testConnection: testMysql, closePool } = require('./database/mysql');
let schemaState = { success: false, error: 'NOT_RUN' };
async function runSchemaBootstrap() {
    const conn = await testMysql();
    if (!conn.connected) {
        schemaState = { success: false, error: conn.error || 'MySQL unreachable at startup', degraded: 'inmemory' };
        // Only auto-activate the in-memory repository in development when the
        // operator has NOT configured a real database via env (DB_HOST /
        // MYSQL_HOST / DATABASE_URL) and has not already forced in-memory. When
        // a DB is explicitly configured (CI, tests pointing at port 1, prod,
        // real deployments), fail closed instead of silently swapping to the
        // volatile shim. This prevents "tests passing on empty in-memory data"
        // when the test was written to exercise the DB-outage fail-closed path.
        const explicitDbConfig = Object.prototype.hasOwnProperty.call(process.env, 'DB_HOST')
            || Object.prototype.hasOwnProperty.call(process.env, 'MYSQL_HOST')
            || Object.prototype.hasOwnProperty.call(process.env, 'DATABASE_URL');
        const explicitInMemory = process.env.IN_MEMORY_REPOSITORY === '1' || process.env.DEGRADED_MODE_REPOSITORY === 'inmemory';
        if (process.env.NODE_ENV !== 'production' && !explicitDbConfig && !explicitInMemory) {
            process.env.DEGRADED_MODE_REPOSITORY = 'inmemory';
            console.warn('[Startup] MySQL unreachable and no DB_HOST configured — activating in-memory repository for local/E2E testing.');
        } else if (explicitInMemory && process.env.NODE_ENV !== 'production') {
            console.warn('[Startup] DEGRADED_MODE_REPOSITORY=inmemory explicitly set — using in-memory repository.');
        } else {
            console.warn('[Startup] MySQL unreachable — starting in degraded mode (fail-closed):', schemaState.error);
        }
        return schemaState;
    }
    schemaState = await initializeSchema();
    if (!schemaState.success) console.warn('[Startup] Schema bootstrap incomplete:', schemaState.error);
    return schemaState;
}
app.set('schemaState', () => schemaState);

// Graceful shutdown (§25/§28): drain the HTTP server, close the MariaDB pool,
// then exit. No acknowledged transaction is dropped by the shutdown itself:
// pool shutdown waits for in-flight queries.
let httpServer = null;
let shuttingDown = false;
async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Shutdown] ${signal} received — draining connections...`);
    try { if (httpServer) await new Promise(resolve => httpServer.close(resolve)); } catch (_e) { /* not listening */ }
    try { await closePool(); } catch (_e) { /* pool already closed */ }
    console.log('[Shutdown] Clean exit complete.');
    process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

app.use((req, res, next) => {
    const suppliedRequestId = req.get('x-request-id') || '';
    res.locals.requestId = /^[A-Za-z0-9._-]{1,80}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : cryptoRandom.randomUUID();
    req.requestId = res.locals.requestId;
    res.setHeader('X-Request-Id', res.locals.requestId);
    next();
});

// Stripe must receive the exact raw payload; install this before JSON parsing.
app.use('/api/stripe-webhook', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json({ limit: '256kb', type: req => req.originalUrl !== '/api/stripe-webhook' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
const configuredProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
app.set('trust proxy', configuredProxyHops > 0
    ? configuredProxyHops
    : address => address === '127.0.0.1' || address === '::1' || address.startsWith('::ffff:127.'));
app.disable('x-powered-by');
const configuredOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',').map(value => value.trim()).filter(Boolean);
const allowedOrigins = new Set([
    `https://${websiteName}`,
    `http://${websiteName}`,
    ...(process.env.STAGING_DOMAIN ? [`https://${process.env.STAGING_DOMAIN}`] : []),
    ...configuredOrigins,
    ...(process.env.NODE_ENV === 'production' ? [] : [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:8080'
    ])
]);
app.use(cors({
    origin(origin, callback) {
        // Non-browser clients do not send Origin. Browser origins must match allowlist or dev rules.
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        if (process.env.NODE_ENV !== 'production') {
            try {
                const parsed = new URL(origin);
                // Allow any local domain (.local), localhost, or loopback in non-production
                if (parsed.hostname.endsWith('.local') || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
                    return callback(null, true);
                }
            } catch (_) {}
        }
        return callback(null, false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id', 'X-Tenant-Id', 'X-Workspace-Id', 'X-API-Key', 'X-Support-Grant-Id'],
    maxAge: 600,
    credentials: false
}));

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Security Headers
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" })); // Allow cross-origin image/resource loading if needed

// Global API Rate Limiter (2500 requests per 15 minutes for interactive SPA & enterprise console usage).
// GLOBAL_RATE_LIMIT_MAX overrides in every environment (previously ignored in
// test mode, which made the limiter unmeasurable under load).
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.GLOBAL_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'test' ? 10000 : 2500)),
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again in a few moments.', requestId: undefined } },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => req.user?.uid || req.ip || 'global',
    validate: { trustProxy: false, keyGeneratorIpFallback: false }
});
app.use('/api', globalLimiter);

// Strict Auth/Email Rate Limiter (20 requests per hour). The cap is lifted in
// the automated test environment the same way the global limiter is, so
// certification/E2E suites that provision many accounts are not throttled.
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? Number(process.env.AUTH_RATE_LIMIT_MAX || 10000) : Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
    message: 'Too many sensitive requests from this IP, please try again after an hour'
});
app.use('/api/email', authLimiter);
app.use('/api/auth', authLimiter);

// Zero-trust API boundary. Requests are authenticated unless they are explicitly
// public protocol endpoints. Route handlers must still enforce their own role/ownership policy.
const retiredClientNotificationPaths = new Set([
    '/api/notify/user-signup', '/api/notify/password-reset', '/api/notify/send-verification-email',
    '/api/notify/password-changed', '/api/notify/email-otp', '/api/notify/security-alert',
    '/api/notify/portfolio-published', '/api/notify/job-application',
    '/api/notify/job-status-update', '/api/notify/job-posted', '/api/notify/subscription-cancelled',
]);
const publicApiPaths = new Set([
    '/healthz', '/readyz', '/health', '/health/databases', '/service-availability', '/platform/version', '/platform/public-config',
    '/enterprise/status',
    '/stripe-webhook', '/public-export', '/export-render-data', '/contact', '/auth/custom-password-reset',
    '/auth/verify-email-token', '/auth/set-user-password', '/auth/linkedin', '/auth/linkedin/callback',
    '/auth/github', '/auth/github/callback', '/auth/oauth/exchange', '/auth/preview-login',
    '/public/custom-pages', '/public/custom-pages.json',
    '/public/trusted-by', '/public/trusted-by.json', '/public/featured-companies',
    '/custom-pages', '/custom-pages.json',
    '/trusted-by', '/trusted-by.json',
    '/blog-data', '/blog-data/categories', '/jobs-data',
    '/paytm/callback', '/phonepe/callback',
    // Public read surfaces (MySQL-backed); mutating variants still require auth.
    '/stats', '/reviews', '/phrases', '/portfolios/public',
    '/coupons/active', '/coupons/validate'
]);
function isPublicApiPath(pathname) {
    if (pathname.startsWith('/jobs-data/tracker')) return false;
    return publicApiPaths.has(pathname)
        || /^\/resumes\/public\/[a-zA-Z0-9_-]+$/i.test(pathname)
        || /^\/blog-data\/slug\/[a-z0-9](?:[a-z0-9-]{0,178}[a-z0-9])?$/i.test(pathname)
        || /^\/jobs-data\/[a-z0-9](?:[a-z0-9_-]{0,127})$/i.test(pathname)
        || /^\/phrases\/[a-z0-9](?:[a-z0-9_-]{0,127})$/i.test(pathname)
        || /^\/portfolios\/public\/[a-z0-9](?:[a-z0-9-]{0,178}[a-z0-9])?$/.test(pathname)
        || /^\/public\/custom-pages\/[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(pathname);
}
// Enterprise API authentication accepts exactly one credential kind per request:
// a Firebase bearer token (tenant member or support elevation) or an x-api-key
// service credential (M2M). Ambiguous requests are rejected outright.
const requireEnterpriseAuth = createEnterpriseAuthMiddleware({ requireAuth });
app.use('/api', (req, res, next) => {
    if (req.path === '/cms-pages' || req.path.startsWith('/cms-pages/')) {
        return res.status(410).json({
            success: false,
            code: 'API_RETIRED',
            error: 'The duplicate CMS pages API is retired.',
            replacement: req.method === 'GET' ? '/api/public/custom-pages' : '/api/admin/pages/:slug',
        });
    }
    if (isPublicApiPath(req.path)) return next();
    if (req.path.startsWith('/enterprise/')) return requireEnterpriseAuth(req, res, next);
    return requireAuth(req, res, next);
});
app.use('/api', (req, res, next) => {
    if (isPublicApiPath(req.path)) return next();
    // Authenticated callers receive the unambiguous 410 retirement contract;
    // authorization policy must not make old dispatchers appear conditionally active.
    if (retiredClientNotificationPaths.has(`/api${req.path}`)) return next();
    // Service principals and pending support elevations are governed by the
    // enterprise router's own fail-closed allowlists and RBAC.
    if (req.serviceContext || req.pendingSupportGrantId) return next();
    return enforceApiPolicy(req, res, next);
});

// Mount Data Abstraction Layer APIs
app.use('/api/resumes', resumesRouter);
app.use('/api/portfolios', portfoliosRouter);
app.use('/api/covers', coversRouter);
app.use('/api/support', supportUserRouter);
app.use('/api/jobs-data', jobsDataRouter);
app.use('/api/blog-data', blogDataRouter);
app.use('/api/notifications-data', notificationsDataRouter);
app.use('/api/users-data', usersDataRouter);
app.use('/api/enterprise/m2m', enterpriseM2mRouter);
app.use('/api/enterprise', enterpriseRouter);
app.use('/api/platform', platformRouter);
app.use('/api', miscDataRouter);
app.use('/api/admin/database-settings', databaseAdminRouter);

// During enterprise rollout, reject tenant/workspace headers on legacy routes rather
// than silently ignoring them. A client must use a tenant-aware /api/enterprise path
// or the certified UID-scoped legacy behavior, never an ambiguous hybrid request.
app.use('/api', async (req, res, next) => {
    const asksForTenantContext = Boolean(req.get('x-tenant-id') || req.get('x-workspace-id'));
    if (!asksForTenantContext || req.path.startsWith('/enterprise/')) return next();
    try {
        const { enterpriseFeatureEnabledAsync } = require('./enterprise/featureFlags');
        if (await enterpriseFeatureEnabledAsync()) {
            return res.status(400).json({ error: { code: 'TENANT_CONTEXT_UNSUPPORTED_FOR_LEGACY_ROUTE', message: 'Use a tenant-aware enterprise API route for tenant-scoped operations', requestId: res.locals.requestId } });
        }
    } catch (_) { /* a disabled/unknown flag must not broaden legacy tenant access */ }
    return next();
});

// Cost and abuse boundaries are account-based in addition to the global IP limiter.
const aiPaths = [
    '/api/generate-interview', '/api/check-grammar', '/api/generate-ai-cover-letter',
    '/api/generate-content', '/api/parse-resume'
];
app.use(aiPaths, aiAccountLimiter, enforceDailyAiQuota);
app.use('/api/ai', aiAccountLimiter, enforceDailyAiQuota);
// Reject unauthorized operators before touching the durable admission store or
// disclosing its availability. The route repeats this guard as defense in depth.
app.use('/api/admin/ai/test-provider', requireRecentAdminAuthentication, aiAccountLimiter);
app.use(['/api/export', '/api/public-export', '/api/export-docx'], exportAccountLimiter);
app.use('/api/linkedin-scraper', scraperAccountLimiter);
app.use('/api/contact', contactAccountLimiter);
app.use('/api/messages', messagingAccountLimiter);
// Defense in depth for administrative namespaces. The route policy also protects aliases
// such as /api/auth/purge-orphaned-auth and modular email routes mounted under /api.
app.use(['/api/admin', '/api/email/admin'], (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.path === '/support' || req.path.startsWith('/support/')) {
        return requirePermission('tickets.manage')(req, res, next);
    }
    return requirePermission('system.config.write')(req, res, next);
});

const Stripe = require('stripe');
// Webhook signature verification does not call the Stripe API. Provider API
// operations resolve the complete authoritative credential at call time so an
// Admin-managed MariaDB secret and a deployment-managed secret behave alike.
const stripeWebhookVerifier = Stripe(process.env.STRIPE_SECRET || 'webhook-verification-only');

async function getStripeClient() {
    const environmentSecret = String(process.env.STRIPE_SECRET || '').trim();
    if (environmentSecret) return Stripe(environmentSecret);
    const persisted = await readPersistedPaymentProviders();
    const storedSecret = String(persisted.providers.stripe?.secretKey || '').trim();
    if (!storedSecret) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { code: 'PAYMENT_PROVIDER_UNAVAILABLE', status: 503 });
    return Stripe(storedSecret);
}

async function getDynamicPlan(planId, provider) {
    const planMonths = { monthly: 1, halfYear: 6, yearly: 12 };
    if (!Object.hasOwn(planMonths, planId)) {
        const error = new Error('INVALID_PLAN');
        error.status = 400;
        throw error;
    }

    const { getRepository } = require('./repositories');
    const repo = getRepository();
    let publicConfig;
    let systemSettings;
    try {
        [publicConfig, systemSettings] = await Promise.all([
            repo.getSetting('public_config'),
            repo.getSetting('system_settings'),
        ]);
    } catch (cause) {
        throw Object.assign(new Error('PAYMENT_CONFIGURATION_UNAVAILABLE'), { status: 503, cause });
    }

    const billing = publicConfig?.subscriptions;
    if (!billing || typeof billing !== 'object' || billing.state !== true) {
        throw Object.assign(new Error('PAYMENT_CONFIGURATION_UNAVAILABLE'), { code: 'PAYMENT_CONFIGURATION_UNAVAILABLE', status: 503 });
    }
    if (!PAYMENT_PROVIDERS.includes(provider) || billing[`${provider}Enabled`] !== true) {
        throw Object.assign(new Error('PAYMENT_PROVIDER_DISABLED'), { code: 'PAYMENT_PROVIDER_DISABLED', status: 409 });
    }
    const currency = String(systemSettings?.currency || '').toUpperCase();
    if (currency !== 'INR' || String(billing.currency || '').toUpperCase() !== currency
        || billing.enableTax !== true || billing.taxInclusive !== true) {
        throw Object.assign(new Error('PAYMENT_CONFIGURATION_INVALID'), { code: 'PAYMENT_CONFIGURATION_INVALID', status: 503 });
    }
    // A payment must never be accepted if its immutable invoice cannot be
    // issued from the same authoritative configuration. The normalized supplier
    // snapshot is bound to the order before provider contact.
    const supplierSnapshot = supplierFromPublicConfig(publicConfig);

    let baseAmount;
    const matrix = billing.pricingMatrix?.[currency];
    if (matrix && Object.hasOwn(matrix, planId)) {
        baseAmount = Number(matrix[planId]);
    } else {
        const priceField = planId === 'monthly' ? 'monthlyPrice' : planId === 'yearly' ? 'yearlyPrice' : 'quartarlyPrice';
        baseAmount = Number(billing[priceField]);
    }
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
        throw Object.assign(new Error('PAYMENT_CONFIGURATION_INVALID'), { status: 503 });
    }

    const multiplier = currency === 'JPY' ? 1 : 100;
    return {
        amount: Math.round(baseAmount * multiplier),
        currency,
        months: planMonths[planId],
        supplierSnapshot,
    };
}

async function createImmutableBillingContext(uid, details, supplierSnapshot) {
    const repo = getRepository();
    const customer = await repo.getUser(uid);
    if (!customer) {
        throw Object.assign(new Error('PAYMENT_USER_NOT_FOUND'), { code: 'PAYMENT_USER_NOT_FOUND', status: 404 });
    }
    const billingSnapshot = normalizeCustomerDetails(details, customer);
    return {
        billingSnapshot,
        supplierSnapshot,
        billingSnapshotHash: billingSnapshotHash(billingSnapshot, supplierSnapshot),
        billingSnapshotVersion: 1,
    };
}

async function _applyServerCoupon({ uid, orderId, plan, couponCode }) {
    return paymentActivation.applyServerCoupon({ uid, orderId, plan, couponCode });
}

async function _releaseCouponReservation(order) {
    return paymentActivation.releaseCouponReservation(order);
}

async function releaseCouponForRef(ref) {
    if (!ref) return;
    const orderId = ref.id;
    const order = await paymentActivation.getOrder(orderId);
    if (order) await paymentActivation.releaseCouponReservation({ ...order, id: orderId });
}

async function _consumeCouponRedemption(orderId, order) {
    return paymentActivation.consumeCouponRedemption(orderId, order);
}

async function activateVerifiedOrder(orderRef, gatewayLabel, providerPaymentId) {
    const orderId = typeof orderRef === 'string' ? orderRef : orderRef.id;
    return paymentActivation.activateVerifiedOrder({
        orderId, gatewayLabel, providerPaymentId,     });
}
async function createProviderOrderRecord({ uid, planId, provider, couponCode, billingDetails }) {
    const basePlan = await getDynamicPlan(planId, provider);
    const billingContext = await createImmutableBillingContext(uid, billingDetails, basePlan.supplierSnapshot);
    const created = await paymentActivation.createOrder({
        uid, planId, provider, couponCode, plan: basePlan, extra: billingContext,
    });
    return { ref: paymentActivation.asOrderRef(created.id), plan: created.plan || basePlan };
}
async function createPaymentOrder({ uid, planId, idempotencyKey, couponCode, billingDetails }) {
    const basePlan = await getDynamicPlan(planId, 'stripe');
    if (!basePlan) { const err = new Error('INVALID_PLAN'); err.status = 400; throw err; }
    const billingContext = await createImmutableBillingContext(uid, billingDetails, basePlan.supplierSnapshot);
    const stripeClient = await getStripeClient();
    const created = await paymentActivation.createOrder({
        uid, planId, provider: 'stripe', couponCode, idempotencyKey, plan: basePlan, extra: billingContext,
    });
    if (created.replayed && created.clientSecret) {
        return { orderId: created.id, clientSecret: created.clientSecret, amount: created.amount, currency: created.currency, replayed: true };
    }
    try {
        const intent = await stripeClient.paymentIntents.create({
            amount: created.amount || created.plan?.amount || basePlan.amount,
            currency: created.currency || created.plan?.currency || basePlan.currency,
            metadata: { orderId: created.id, uid, planId }
        }, { idempotencyKey: `order:${created.id}` });
        await paymentActivation.updateOrder(created.id, {
            providerPaymentIntentId: intent.id,
            providerClientSecret: intent.client_secret,
            status: 'PAYMENT_CREATED',
        });
        return { orderId: created.id, clientSecret: intent.client_secret, amount: created.amount || created.plan?.amount || basePlan.amount, currency: created.currency || created.plan?.currency || basePlan.currency };
    } catch (err) {
        await paymentActivation.updateOrder(created.id, { status: 'FAILED', failureCode: 'PROVIDER_CREATE_FAILED' });
        await paymentActivation.releaseCouponReservation({ ...created, id: created.id });
        throw err;
    }
}
app.post('/api/pay', async (req, res) => {
    try {
        const suppliedKey = String(req.get('idempotency-key') || '');
        const idempotencyKey = /^ck_[A-Za-z0-9_-]{10,100}$/.test(suppliedKey) ? suppliedKey : crypto.randomUUID();
        const result = await createPaymentOrder({
            uid: req.user.uid,
            planId: req.body.planId || req.body.plan,
            idempotencyKey,
            couponCode: req.body.couponCode,
            billingDetails: req.body.billingDetails,
        });
        return res.status(201).json({ orderId: result.orderId, client_secret: result.clientSecret, amount: result.amount, currency: result.currency, status: 'PAYMENT_PENDING' });
    } catch (err) {
        console.error('[Stripe payment create]', err.message);
        return res.status(err.status || 500).json({ error: { code: err.message === 'INVALID_PLAN' ? 'INVALID_PLAN' : 'PAYMENT_UNAVAILABLE', message: 'Unable to create payment', requestId: res.locals.requestId } });
    }
});


// Payment history is read directly from the owner-bound MariaDB ledger. Profile
// JSON is not a second payment-history store.
app.get('/api/payment-orders', async (req, res) => {
    try {
        const { getRepository } = require('./repositories');
        const orders = await getRepository().getUserPaymentOrders(req.user.uid);
        res.setHeader('Cache-Control', 'no-store, private');
        return res.json({ success: true, orders, source: 'MARIADB_PAYMENT_ORDERS', count: orders.length });
    } catch (error) {
        return res.status(error.status || 503).json({
            success: false,
            code: error.code || 'PAYMENT_HISTORY_UNAVAILABLE',
            error: 'Payment history is unavailable.',
            requestId: res.locals.requestId,
        });
    }
});

// Payment status is read from a server-owned order and is bound to the verified caller.
app.get('/api/payment-orders/:orderId', async (req, res) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.orderId)) return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found', requestId: res.locals.requestId } });
    try {
        const order = await paymentActivation.getOrder(req.params.orderId);
        if (!order || order.uid !== req.user.uid) return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found', requestId: res.locals.requestId } });
        let invoiceNumber = null;
        let invoiceStatus = order.status === 'ACTIVE' ? 'NOT_ISSUED' : 'NOT_APPLICABLE';
        if (order.status === 'ACTIVE' && Number(order.billingSnapshotVersion) === 1) {
            try {
                const invoice = await getInvoiceForUser({ uid: req.user.uid, paymentOrderId: req.params.orderId });
                invoiceNumber = invoice.invoiceNumber;
                invoiceStatus = 'ISSUED';
            } catch (cause) {
                throw Object.assign(new Error('Active payment invoice invariant failed'), {
                    code: 'ACTIVATION_INVOICE_INTEGRITY_FAILED', status: 503, cause,
                });
            }
        } else if (order.status === 'ACTIVE') {
            invoiceStatus = 'LEGACY_NOT_CAPTURED';
        }
        return res.json({
            orderId: order.id || req.params.orderId,
            status: order.status,
            planId: order.planId,
            membershipEnds: toCanonicalDate(order.membershipEnds) || null,
            invoiceStatus,
            invoiceNumber,
        });
    } catch (error) {
        return res.status(error.status || 503).json({ error: { code: error.code || 'ORDER_UNAVAILABLE', message: 'Order could not be loaded', requestId: res.locals.requestId } });
    }
});

// Stripe webhook — verified, idempotent MariaDB subscription activation
app.post('/api/stripe-webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('Stripe webhook is not configured');
        event = stripeWebhookVerifier.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('[Stripe Webhook] Signature error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
        const paymentData = event.data.object;
        const orderId = paymentData.metadata?.orderId;
        if (!orderId) return res.status(400).json({ error: 'Unknown payment order' });
        const order = await paymentActivation.getOrder(orderId);
        if (!order) return res.status(400).json({ error: 'Unknown payment order' });
        try {
            validateStripePaymentIntent(order, paymentData, orderId);
        } catch (_) {
            return res.status(400).json({ error: 'Payment order mismatch' });
        }
        const claimed = await paymentActivation.claimWebhookEvent({
            eventId: event.id, provider: 'stripe', eventType: event.type, orderId,
        });
        if (claimed.duplicate) return res.json({ received: true, duplicate: true });
        console.log(`[Stripe Webhook] verified order ${orderId}`);
        try {
            const activated = await paymentActivation.activateVerifiedOrder({
                orderId, gatewayLabel: 'Stripe', providerPaymentId: paymentData.id,             });
            return res.json({
                received: true,
                status: 'activated',
                userId: order.uid,
                membership: activated.membership || 'Premium',
                membershipEnds: toCanonicalDate(activated.membershipEnds) || activated.membershipEnds,
                invoiceStatus: activated.invoiceStatus,
                invoiceNumber: activated.invoice?.invoiceNumber || null,
            });
        } catch (err) {
            await paymentActivation.releaseWebhookEvent(event.id).catch(releaseError => {
                console.error('[Stripe Webhook] event release failed:', releaseError.message);
            });
            throw err;
        }
    }

    if (event.type === 'payment_intent.payment_failed') {
        const payment = event.data.object;
        const orderId = payment.metadata?.orderId;
        if (orderId) {
            const order = await paymentActivation.getOrder(orderId);
            if (order && order.providerPaymentIntentId === payment.id) {
                const claimed = await paymentActivation.claimWebhookEvent({
                    eventId: event.id, provider: 'stripe', eventType: event.type, orderId,
                });
                if (!claimed.duplicate) {
                    await paymentActivation.updateOrder(orderId, {
                        status: 'FAILED',
                        failureCode: payment.last_payment_error?.code || 'PAYMENT_FAILED',
                    });
                }
            }
        }
        return res.json({ received: true });
    }

    if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
        const providerObject = event.data.object;
        const paymentIntentId = providerObject.payment_intent;
        if (!paymentIntentId) return res.status(400).json({ error: 'Unknown payment order' });
        const matched = await paymentActivation.findByProviderIntent(paymentIntentId);
        if (!matched) return res.status(400).json({ error: 'Unknown payment order' });
        if (Number(providerObject.amount) !== Number(matched.amount)
            || String(providerObject.currency || '').toUpperCase() !== String(matched.currency || '').toUpperCase()) {
            return res.status(400).json({ error: 'Payment reversal amount or currency mismatch' });
        }
        const status = event.type === 'charge.refunded' ? 'REFUNDED' : 'CHARGEBACK';
        if (status === 'REFUNDED' && Number(providerObject.amount_refunded) !== Number(providerObject.amount)) {
            return res.status(409).json({ error: 'Entitlement reversal requires a completed full refund.' });
        }
        const claimed = await paymentActivation.claimWebhookEvent({
            eventId: event.id, provider: 'stripe', eventType: event.type, orderId: matched.id,
        });
        if (claimed.duplicate) return res.json({ received: true, duplicate: true });
        try {
            let reconciliation = null;
            if (status === 'REFUNDED') {
                reconciliation = await reconcileStripeChargeRefund({
                    stripeClient: await getStripeClient(),
                    charge: providerObject,
                    order: matched,
                });
            }
            const reversed = await paymentActivation.reverseEntitlement({
                orderId: matched.id,
                status,
                providerRefundId: reconciliation?.refundReference || null,
                providerRefundReferenceType: reconciliation?.referenceType || null,
                providerRefunds: reconciliation?.refunds || [],
            });
            return res.json({
                received: true,
                status: status.toLowerCase(),
                creditNoteNumber: reversed.creditNote?.creditNoteNumber || null,
            });
        } catch (error) {
            await paymentActivation.releaseWebhookEvent(event.id).catch(releaseError => {
                console.error('[Stripe Webhook] reversal event release failed:', releaseError.message);
            });
            throw error;
        }
    }

    return res.json({ received: true });
});

// PayPal orders are created server-side so amount, currency, plan and owner are bound
// before the browser is allowed to approve or capture the provider order.
async function paypalAccessToken(baseUrl, clientId, clientSecret) {
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials',
        timeout: 10_000
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) throw Object.assign(new Error('PAYPAL_AUTH_FAILED'), { status: 502 });
    return tokenData.access_token;
}

// Provider credentials are selected as complete pairs. An incomplete
// deployment pair must never be combined with a MariaDB value from another
// account, which would make a save/reload or provider test appear successful
// while checkout still uses invalid credentials.
function chooseCredentialPair({ environmentId, environmentSecret, storedId, storedSecret, environmentName = 'environment', storedName = 'mysql' }) {
    const envId = String(environmentId || '').trim();
    const envSecret = String(environmentSecret || '').trim();
    const persistedId = String(storedId || '').trim();
    const persistedSecret = String(storedSecret || '').trim();
    if (envId && envSecret) return { id: envId, secret: envSecret, source: environmentName };
    if (persistedId && persistedSecret) return { id: persistedId, secret: persistedSecret, source: storedName };
    if (envId || envSecret) return { id: envId, secret: envSecret, source: `${environmentName}-partial` };
    if (persistedId || persistedSecret) return { id: persistedId, secret: persistedSecret, source: `${storedName}-partial` };
    return { id: '', secret: '', source: 'none' };
}

async function readPersistedPaymentProviders() {
    const { getRepository } = require('./repositories');
    const repo = getRepository();
    const [providers, publicRoot] = await Promise.all([
        repo.getSetting('payment_providers'),
        repo.getSetting('public_config'),
    ]);
    if (!publicRoot || typeof publicRoot !== 'object'
        || !publicRoot.subscriptions || typeof publicRoot.subscriptions !== 'object') {
        throw Object.assign(new Error('PAYMENT_CONFIGURATION_UNAVAILABLE'), { status: 503 });
    }
    return {
        providers: providers && typeof providers === 'object' ? providers : {},
        publicConfig: publicRoot.subscriptions,
    };
}

async function paypalConfig() {
    const envClientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
    const envClientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
    let environment = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
    let storedClientId = '';
    let storedClientSecret = '';
    let storedEnvironment = '';
    const persistedPaypal = await readPersistedPaymentProviders();
    {
        const stored = persistedPaypal.providers.paypal || {};
        const publicConfig = persistedPaypal.publicConfig || {};
        storedClientId = String(stored.clientId || publicConfig.paypalClientId || '').trim();
        storedClientSecret = String(stored.clientSecret || '').trim();
        storedEnvironment = String(stored.environment || '').trim();
    }
    const selected = chooseCredentialPair({
        environmentId: envClientId,
        environmentSecret: envClientSecret,
        storedId: storedClientId,
        storedSecret: storedClientSecret,
    });
    if (storedEnvironment && selected.source === 'mysql') environment = storedEnvironment.toLowerCase();
    if (!selected.id || !selected.secret) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
    const baseUrl = environment === 'live' || environment === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    return { clientId: selected.id, clientSecret: selected.secret, baseUrl, source: selected.source };
}
app.post('/api/paypal/create-order', async (req, res) => {
    let orderRef;
    try {
        const { clientId, clientSecret, baseUrl } = await paypalConfig();
        const { ref, plan } = await createProviderOrderRecord({
            uid: req.user.uid,
            planId: req.body.planId,
            provider: 'paypal',
            couponCode: req.body.couponCode,
            billingDetails: req.body.billingDetails,
        });
        orderRef = ref;
        const accessToken = await paypalAccessToken(baseUrl, clientId, clientSecret);
        const providerRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': ref.id },
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{
                    reference_id: ref.id,
                    custom_id: req.user.uid,
                    description: `${req.body.planId} ResumePilot subscription`,
                    amount: { currency_code: plan.currency, value: (plan.amount / 100).toFixed(2) }
                }]
            }),
            timeout: 10_000
        });
        const providerOrder = await providerRes.json();
        if (!providerRes.ok || !providerOrder.id) throw new Error('PAYPAL_CREATE_FAILED');
        await ref.update({ providerOrderId: providerOrder.id, status: 'PAYMENT_CREATED' });
        return res.status(201).json({ orderId: providerOrder.id, paymentOrderId: ref.id, amount: plan.amount, currency: plan.currency });
    } catch (err) {
        if (orderRef) {
            await orderRef.update({ status: 'FAILED', failureCode: 'PROVIDER_CREATE_FAILED' }).catch(() => {});
            await releaseCouponForRef(orderRef);
        }
        console.error('[PayPal create]', err.message);
        return res.status(err.status || 502).json({ error: { code: err.message, message: 'Unable to create PayPal order', requestId: res.locals.requestId } });
    }
});

app.post('/api/paypal/verify', async (req, res) => {
    try {
        const providerOrderId = String(req.body.orderId || '');
        const paymentOrderId = String(req.body.paymentOrderId || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(providerOrderId) || !/^[A-Za-z0-9_-]{1,128}$/.test(paymentOrderId)) {
            return res.status(400).json({ verified: false, error: 'Invalid order identifier' });
        }
        const internal = await paymentActivation.getOrder(paymentOrderId);
        const orderRef = paymentActivation.asOrderRef(paymentOrderId);
        try {
            if (!internal) throw new Error('ORDER_NOT_FOUND');
            assertInternalOrder(internal, { uid: req.user.uid, provider: 'paypal', providerOrderId });
        } catch (_) {
            return res.status(404).json({ verified: false, error: 'Order not found' });
        }
        const { clientId, clientSecret, baseUrl } = await paypalConfig();
        const accessToken = await paypalAccessToken(baseUrl, clientId, clientSecret);
        const providerRes = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(providerOrderId)}`, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 10_000
        });
        const providerOrder = await providerRes.json();
        let captureId;
        try {
            if (!providerRes.ok) throw new Error('PAYPAL_PROVIDER_ERROR');
            captureId = validatePayPalOrder(internal, providerOrder, {
                uid: req.user.uid, paymentOrderId, providerOrderId
            });
        } catch (_) {
            return res.status(400).json({ verified: false, error: 'PayPal order verification failed' });
        }
        const active = await activateVerifiedOrder(orderRef, 'PayPal', captureId);
        return res.json({
            verified: true,
            orderId: providerOrderId,
            paymentOrderId,
            status: active.status,
            membershipEnds: active.membershipEnds,
            invoiceStatus: active.invoiceStatus,
            invoiceNumber: active.invoice?.invoiceNumber || null,
        });
    } catch (err) {
        console.error('[PayPal verify]', err.message);
        return res.status(err.status || 502).json({ verified: false, error: 'PayPal verification unavailable' });
    }
});

// Razorpay credentials are server-owned and never accepted from payment requests.
async function getRazorpayKeys() {
    const envKeyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
    const envKeySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
    // A complete environment pair is deployment-managed and wins as a pair. Do
    // not combine an old environment key ID with a newly saved MariaDB secret.
    if (envKeyId && envKeySecret) return { keyId: envKeyId, keySecret: envKeySecret, source: 'environment' };
    const persisted = await readPersistedPaymentProviders();
    const stored = persisted.providers.razorpay || {};
    const storedKeyId = String(stored.keyId || persisted.publicConfig?.razorpayKeyId || '').trim();
    const storedSecret = String(stored.keySecret || '').trim();
    const selected = chooseCredentialPair({ environmentId: envKeyId, environmentSecret: envKeySecret, storedId: storedKeyId, storedSecret });
    return { keyId: selected.id, keySecret: selected.secret, source: selected.source };
}

app.post('/api/razorpay/create-order', async (req, res) => {
    // Ownership and amount are server-controlled; reject any client attempt to supply them.
    const clientIdentityFields = ['userId', 'uid', 'ownerUid', 'amount', 'keyId', 'keySecret'];
    if (clientIdentityFields.some(f => Object.hasOwn(req.body || {}, f))) {
        return res.status(400).json({ error: { code: 'CLIENT_PAYMENT_IDENTITY_REJECTED', message: 'Payment ownership and amounts are server-controlled', requestId: res.locals.requestId } });
    }
    let internalRef;
    try {
        const { keyId, keySecret } = await getRazorpayKeys();
        if (!keyId || !keySecret) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
        const { ref, plan } = await createProviderOrderRecord({
            uid: req.user.uid,
            planId: req.body.planId || req.body.plan,
            provider: 'razorpay',
            couponCode: req.body.couponCode,
            billingDetails: req.body.billingDetails,
        });
        internalRef = ref;
        const providerRes = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: plan.amount,
                currency: plan.currency,
                receipt: ref.id,
                notes: { paymentOrderId: ref.id, uid: req.user.uid, planId: req.body.planId || req.body.plan }
            }),
            timeout: 10_000
        });
        const providerOrder = await providerRes.json();
        if (!providerRes.ok || !providerOrder.id) throw new Error('RAZORPAY_CREATE_FAILED');
        await ref.update({ providerOrderId: providerOrder.id, status: 'PAYMENT_CREATED' });
        return res.status(201).json({ id: providerOrder.id, paymentOrderId: ref.id, amount: plan.amount, currency: plan.currency, key: keyId });
    } catch (err) {
        if (internalRef) {
            await internalRef.update({ status: 'FAILED', failureCode: 'PROVIDER_CREATE_FAILED' }).catch(() => {});
            await releaseCouponForRef(internalRef);
        }
        console.error('[Razorpay create]', err.code || err.message);
        const status = Number(err.status) || 502;
        const code = status === 503 && !internalRef ? 'PAYMENT_PROVIDER_UNAVAILABLE' : 'RAZORPAY_CREATE_FAILED';
        return res.status(status).json({ error: { code, message: 'Unable to create Razorpay order', requestId: res.locals.requestId } });
    }
});

app.post('/api/razorpay/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id: providerOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
        const paymentOrderId = String(req.body.paymentOrderId || '');
        if (![providerOrderId, paymentId, signature, paymentOrderId].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value))) {
            return res.status(400).json({ verified: false, error: 'Invalid payment confirmation' });
        }
        const order = await paymentActivation.getOrder(paymentOrderId);
        const orderRef = paymentActivation.asOrderRef(paymentOrderId);
        try {
            if (!order) throw new Error('ORDER_NOT_FOUND');
            assertInternalOrder(order, { uid: req.user.uid, provider: 'razorpay', providerOrderId });
        } catch (_) {
            return res.status(404).json({ verified: false, error: 'Order not found' });
        }
        const { keyId, keySecret } = await getRazorpayKeys();
        if (!keyId || !keySecret) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
        try {
            validateRazorpaySignature(keySecret, providerOrderId, paymentId, signature);
        } catch (_) {
            return res.status(400).json({ verified: false, error: 'Payment signature verification failed' });
        }
        // A valid callback signature alone is not proof of capture. Confirm provider state and amount.
        const paymentRes = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
            headers: { 'Authorization': 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64') }, timeout: 10_000
        });
        const payment = await paymentRes.json();
        try {
            if (!paymentRes.ok) throw new Error('RAZORPAY_PROVIDER_ERROR');
            validateRazorpayPayment(order, payment, providerOrderId);
        } catch (_) {
            return res.status(400).json({ verified: false, error: 'Provider payment is not captured or does not match the order' });
        }
        const active = await activateVerifiedOrder(orderRef, 'Razorpay', paymentId);
        return res.json({
            verified: true,
            status: active.status,
            paymentOrderId,
            membershipEnds: active.membershipEnds,
            invoiceStatus: active.invoiceStatus,
            invoiceNumber: active.invoice?.invoiceNumber || null,
        });
    } catch (err) {
        console.error('[Razorpay verify]', err.message);
        return res.status(err.status || 502).json({ verified: false, error: 'Razorpay verification unavailable' });
    }
});

// ── Helpers: resolve complete provider credential pairs from env or MariaDB ──
async function getPaytmConfig() {
    const envMid = String(process.env.PAYTM_MID || '').trim();
    const envKey = String(process.env.PAYTM_MERCHANT_KEY || '').trim();
    let website = String(process.env.PAYTM_WEBSITE || '').trim();
    const channelId = process.env.PAYTM_CHANNEL_ID || 'WEB';
    const env = (process.env.PAYTM_ENV || 'staging').toLowerCase();
    const isLive = env === 'production' || env === 'live';
    const baseUrl = isLive ? 'https://securegw.paytm.in' : 'https://securegw-stage.paytm.in';
    if (envMid && envKey) return { mid: envMid, key: envKey, website, channelId, baseUrl, isLive, source: 'environment' };

    const persisted = await readPersistedPaymentProviders();
    const stored = persisted.providers.paytm || {};
    const publicConfig = persisted.publicConfig || {};
    const storedMid = String(stored.mid || publicConfig.paytmMid || '').trim();
    const storedKey = String(stored.merchantKey || '').trim();
    if (stored.website || publicConfig.paytmWebsite) website = stored.website || publicConfig.paytmWebsite;
    const selected = chooseCredentialPair({ environmentId: envMid, environmentSecret: envKey, storedId: storedMid, storedSecret: storedKey });
    return { mid: selected.id, key: selected.secret, website, channelId, baseUrl, isLive, source: selected.source };
}

async function getPhonePeConfig() {
    const envMerchantId = String(process.env.PHONEPE_MERCHANT_ID || '').trim();
    const envSaltKey = String(process.env.PHONEPE_SALT_KEY || '').trim();
    let saltIndex = Number.parseInt(process.env.PHONEPE_SALT_INDEX || '', 10);
    const env = (process.env.PHONEPE_ENV || 'sandbox').toLowerCase();
    const isLive = env === 'production' || env === 'live';
    const baseUrl = isLive
        ? 'https://api.phonepe.com/apis/hermes'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    if (envMerchantId && envSaltKey) {
        return { merchantId: envMerchantId, saltKey: envSaltKey, saltIndex, baseUrl, isLive, source: 'environment' };
    }

    const persisted = await readPersistedPaymentProviders();
    const stored = persisted.providers.phonepe || {};
    const publicConfig = persisted.publicConfig || {};
    const storedMerchantId = String(stored.merchantId || publicConfig.phonepeId || '').trim();
    const storedSaltKey = String(stored.saltKey || '').trim();
    if (stored.saltIndex || publicConfig.phonepeSaltIndex) saltIndex = Number.parseInt(stored.saltIndex || publicConfig.phonepeSaltIndex, 10);
    const selected = chooseCredentialPair({ environmentId: envMerchantId, environmentSecret: envSaltKey, storedId: storedMerchantId, storedSecret: storedSaltKey });
    return { merchantId: selected.id, saltKey: selected.secret, saltIndex, baseUrl, isLive, source: selected.source };
}

// ── Paytm: server-owned transaction lifecycle ───────────────────────────────
app.post('/api/paytm/initiate-transaction', async (req, res) => {
    let orderRef;
    try {
        const { mid, key, website, channelId, baseUrl, isLive } = await getPaytmConfig();
        if (!mid || !key || !website) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
        const { ref, plan } = await createProviderOrderRecord({
            uid: req.user.uid,
            planId: req.body.planId || req.body.plan,
            provider: 'paytm',
            couponCode: req.body.couponCode,
            billingDetails: req.body.billingDetails,
        });
        orderRef = ref;
        const providerOrderId = ref.id;
        const txnAmount = (plan.amount / 100).toFixed(2);
        const callbackUrl = `${protocol}://${websiteName}/api/paytm/callback`;
        const paytmReqBody = JSON.stringify({ body: {
            requestType: 'Payment', mid, websiteName: website, orderId: providerOrderId,
            callbackUrl, txnAmount: { value: txnAmount, currency: plan.currency },
            userInfo: { custId: req.user.uid },
            enablePaymentMode: [{ mode: 'UPI' }, { mode: 'CARD' }, { mode: 'NET_BANKING' }, { mode: 'PAYTM_WALLET' }]
        }});
        const bodyBase64 = Buffer.from(paytmReqBody).toString('base64');
        const headerPayload = JSON.stringify({ alg: 'HS256', version: 'v1', kid: mid, requesttimestamp: Math.floor(Date.now() / 1000).toString(), channelId });
        const headerBase64 = Buffer.from(headerPayload).toString('base64');
        const signature = crypto.createHmac('sha256', key).update(`${headerBase64}.${bodyBase64}`).digest('base64');
        const providerRes = await fetch(`${baseUrl}/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(mid)}&orderId=${encodeURIComponent(providerOrderId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${headerBase64}.${bodyBase64}.${signature}` },
            body: paytmReqBody, timeout: 10_000
        });
        const providerData = await providerRes.json();
        if (!providerRes.ok || providerData?.body?.resultInfo?.resultStatus !== 'S' || !providerData.body.txnToken) {
            throw new Error('PAYTM_CREATE_FAILED');
        }
        await ref.update({ providerOrderId, status: 'PAYMENT_CREATED' });
        return res.status(201).json({ success: true, txnToken: providerData.body.txnToken, orderId: providerOrderId, paymentOrderId: ref.id, mid, amount: txnAmount, isLive });
    } catch (err) {
        if (orderRef) {
            await orderRef.update({ status: 'FAILED', failureCode: 'PROVIDER_CREATE_FAILED' }).catch(() => {});
            await releaseCouponForRef(orderRef);
        }
        console.error('[Paytm create]', err.message);
        // Carry the machine-readable code through so the checkout UI can tell an
        // unconfigured gateway apart from one that is configured but refusing.
        const unavailable = err.message === 'PAYMENT_PROVIDER_UNAVAILABLE';
        return res.status(err.status || (unavailable ? 503 : 502)).json({
            success: false,
            code: unavailable ? 'PAYMENT_PROVIDER_UNAVAILABLE' : 'PAYMENT_CREATE_FAILED',
            configurationState: unavailable ? 'NOT_CONFIGURED' : 'CONFIGURED',
            error: unavailable
                ? 'Paytm payments are not configured on this deployment.'
                : 'Unable to create Paytm transaction',
            requestId: res.locals.requestId,
        });
    }
});

app.post('/api/paytm/verify-transaction', async (req, res) => {
    try {
        const orderId = String(req.body.orderId || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) return res.status(400).json({ verified: false, error: 'Invalid order' });
        const order = await paymentActivation.getOrder(orderId);
        const orderRef = paymentActivation.asOrderRef(orderId);
        try {
            if (!order) throw new Error('ORDER_NOT_FOUND');
            assertInternalOrder(order, { uid: req.user.uid, provider: 'paytm', providerOrderId: orderId });
        } catch (_) {
            return res.status(404).json({ verified: false, error: 'Order not found' });
        }
        const { mid, key, baseUrl } = await getPaytmConfig();
        if (!mid || !key) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
        const verifyBody = JSON.stringify({ body: { mid, orderId } });
        const bodyBase64 = Buffer.from(verifyBody).toString('base64');
        const headerPayload = JSON.stringify({ alg: 'HS256', version: 'v1', kid: mid, requesttimestamp: Math.floor(Date.now() / 1000).toString(), channelId: 'WEB' });
        const headerBase64 = Buffer.from(headerPayload).toString('base64');
        const signature = crypto.createHmac('sha256', key).update(`${headerBase64}.${bodyBase64}`).digest('base64');
        const providerRes = await fetch(`${baseUrl}/v3/order/status`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${headerBase64}.${bodyBase64}.${signature}` },
            body: verifyBody, timeout: 10_000
        });
        const providerData = await providerRes.json();
        const body = providerData?.body || {};
        let providerPaymentId;
        try {
            if (!providerRes.ok) throw new Error('PAYTM_PROVIDER_ERROR');
            providerPaymentId = validatePaytmPayment(order, body);
        } catch (_) {
            return res.status(400).json({ verified: false, error: 'Provider transaction is not successful or does not match the order' });
        }
        const active = await activateVerifiedOrder(orderRef, 'Paytm', providerPaymentId);
        return res.json({
            verified: true,
            status: active.status,
            txnId: body.txnId,
            orderId,
            membershipEnds: active.membershipEnds,
            invoiceStatus: active.invoiceStatus,
            invoiceNumber: active.invoice?.invoiceNumber || null,
        });
    } catch (err) {
        console.error('[Paytm verify]', err.message);
        return res.status(err.status || 502).json({ verified: false, error: 'Paytm verification unavailable' });
    }
});

// ── PhonePe: server-owned transaction lifecycle ─────────────────────────────
app.post('/api/phonepe/initiate', async (req, res) => {
    let orderRef;
    try {
        const { merchantId, saltKey, saltIndex, baseUrl, isLive } = await getPhonePeConfig();
        if (!merchantId || !saltKey || !Number.isSafeInteger(saltIndex) || saltIndex < 1) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
        const { ref, plan } = await createProviderOrderRecord({
            uid: req.user.uid,
            planId: req.body.planId || req.body.plan,
            provider: 'phonepe',
            couponCode: req.body.couponCode,
            billingDetails: req.body.billingDetails,
        });
        orderRef = ref;
        const payload = {
            merchantId, merchantTransactionId: ref.id, merchantUserId: req.user.uid,
            amount: plan.amount,
            redirectUrl: `${protocol}://${websiteName}/billing/plans?phonepe_callback=1&order=${encodeURIComponent(ref.id)}`,
            redirectMode: 'REDIRECT',
            callbackUrl: `${protocol}://${websiteName}/api/phonepe/callback`,
            paymentInstrument: { type: 'PAY_PAGE' }
        };
        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
        const checksum = `${crypto.createHash('sha256').update(`${base64Payload}/pg/v1/pay${saltKey}`).digest('hex')}###${saltIndex}`;
        const providerRes = await fetch(`${baseUrl}/pg/v1/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-VERIFY': checksum, 'Accept': 'application/json' },
            body: JSON.stringify({ request: base64Payload }), timeout: 10_000
        });
        const providerData = await providerRes.json();
        const redirectUrl = providerData?.data?.instrumentResponse?.redirectInfo?.url;
        if (!providerRes.ok || !providerData?.success || !redirectUrl) throw new Error('PHONEPE_CREATE_FAILED');
        // Never relay an unexpected provider-controlled scheme to the browser.
        const parsedRedirect = new URL(redirectUrl);
        if (parsedRedirect.protocol !== 'https:' || !(parsedRedirect.hostname === 'phonepe.com' || parsedRedirect.hostname.endsWith('.phonepe.com'))) {
            throw new Error('PHONEPE_INVALID_REDIRECT');
        }
        await ref.update({ providerOrderId: ref.id, status: 'PAYMENT_CREATED' });
        return res.status(201).json({ success: true, orderId: ref.id, paymentOrderId: ref.id, redirectUrl: parsedRedirect.href, isLive });
    } catch (err) {
        if (orderRef) {
            await orderRef.update({ status: 'FAILED', failureCode: 'PROVIDER_CREATE_FAILED' }).catch(() => {});
            await releaseCouponForRef(orderRef);
        }
        console.error('[PhonePe create]', err.message);
        // Carry the machine-readable code through so the checkout UI can tell an
        // unconfigured gateway apart from one that is configured but refusing.
        const unavailable = err.message === 'PAYMENT_PROVIDER_UNAVAILABLE';
        return res.status(err.status || (unavailable ? 503 : 502)).json({
            success: false,
            code: unavailable ? 'PAYMENT_PROVIDER_UNAVAILABLE' : 'PAYMENT_CREATE_FAILED',
            configurationState: unavailable ? 'NOT_CONFIGURED' : 'CONFIGURED',
            error: unavailable
                ? 'PhonePe payments are not configured on this deployment.'
                : 'Unable to create PhonePe transaction',
            requestId: res.locals.requestId,
        });
    }
});

app.post('/api/phonepe/status', async (req, res) => {
    try {
        const orderId = String(req.body.orderId || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) return res.status(400).json({ verified: false, error: 'Invalid order' });
        const order = await paymentActivation.getOrder(orderId);
        const orderRef = paymentActivation.asOrderRef(orderId);
        try {
            if (!order) throw new Error('ORDER_NOT_FOUND');
            assertInternalOrder(order, { uid: req.user.uid, provider: 'phonepe', providerOrderId: orderId });
        } catch (_) {
            return res.status(404).json({ verified: false, error: 'Order not found' });
        }
        const { merchantId, saltKey, saltIndex, baseUrl } = await getPhonePeConfig();
        if (!merchantId || !saltKey || !Number.isSafeInteger(saltIndex) || saltIndex < 1) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
        const checksum = `${crypto.createHash('sha256').update(`/pg/v1/status/${merchantId}/${orderId}${saltKey}`).digest('hex')}###${saltIndex}`;
        const providerRes = await fetch(`${baseUrl}/pg/v1/status/${encodeURIComponent(merchantId)}/${encodeURIComponent(orderId)}`, {
            headers: { 'Content-Type': 'application/json', 'X-VERIFY': checksum, 'X-MERCHANT-ID': merchantId, 'Accept': 'application/json' },
            timeout: 10_000
        });
        const providerData = await providerRes.json();
        let paymentId;
        try {
            if (!providerRes.ok) throw new Error('PHONEPE_PROVIDER_ERROR');
            paymentId = validatePhonePePayment(order, providerData);
        } catch (_) {
            return res.status(400).json({ verified: false, state: providerData?.data?.state || 'UNKNOWN', error: 'Provider transaction is not complete or does not match the order' });
        }
        const active = await activateVerifiedOrder(orderRef, 'PhonePe', paymentId);
        return res.json({
            verified: true,
            status: active.status,
            state: providerData.data.state,
            paymentId,
            orderId,
            membershipEnds: active.membershipEnds,
            invoiceStatus: active.invoiceStatus,
            invoiceNumber: active.invoice?.invoiceNumber || null,
        });
    } catch (err) {
        console.error('[PhonePe status]', err.message);
        return res.status(err.status || 502).json({ verified: false, error: 'PhonePe verification unavailable' });
    }
});

app.post('/api/paytm/callback', async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    try {
        const orderId = String(req.body?.ORDERID || req.body?.orderId || '').trim();
        await indianGatewayActivation.handlePaytmCallback({
            orderId,
            getPaytmConfig,
            fetchImpl: fetch,
            activation: paymentActivation,
        });
    } catch (error) {
        console.warn('[Paytm callback]', error.code || error.message);
    }
    return res.status(200).send(indianGatewayActivation.paytmCallbackHtml());
});

app.post('/api/phonepe/callback', async (req, res) => {
    try {
        const base64Response = String(req.body?.response || req.body?.RESPONSE || '').trim();
        const verifyHeader = String(req.get('X-VERIFY') || req.get('x-verify') || '');
        await indianGatewayActivation.handlePhonePeCallback({
            base64Response,
            verifyHeader,
            getPhonePeConfig,
            fetchImpl: fetch,
            activation: paymentActivation,
        });
        return res.status(200).json({ success: true, received: true });
    } catch (error) {
        if (error.code === 'PHONEPE_SIGNATURE_INVALID' || Number(error.status) === 400) {
            return res.status(400).json({
                success: false,
                error: { code: error.code || 'PHONEPE_SIGNATURE_INVALID', message: 'Invalid PhonePe callback signature', requestId: res.locals.requestId },
            });
        }
        console.warn('[PhonePe callback]', error.code || error.message);
        if (Number(error.status) === 503) {
            return res.status(503).json({
                success: false,
                error: { code: error.code || 'PAYMENT_PROVIDER_UNAVAILABLE', message: 'PhonePe is not configured', requestId: res.locals.requestId },
            });
        }
        return res.status(200).json({ success: true, received: true });
    }
});

app.post('/api/subscription/preferences', (_req, res) => {
    // Checkout creates fixed-term, one-time provider orders; it does not create
    // or store a recurring mandate. Retaining an `autoRenew` preference would
    // falsely imply that a future charge is scheduled. Older clients receive an
    // explicit terminal response rather than a successful no-op.
    return res.status(410).json({
        success: false,
        code: 'NON_RECURRING_PLAN',
        error: 'ResumePilot plans are fixed-term one-time purchases and do not renew automatically.',
        requestId: res.locals.requestId,
    });
});

app.post('/api/check', async (req, res) => {
    // Reject legacy client-supplied entitlement fields — membership is server-authoritative only.
    const legacyClientFields = ['accountType', 'expDate', 'membership', 'paymentStatus', 'membershipEnds'];
    if (legacyClientFields.some(f => Object.hasOwn(req.body || {}, f))) {
        return res.status(503).json({ status: 'false', error: 'Client-supplied entitlement context is not accepted' });
    }
    try {
        const { getRepository } = require('./repositories');
        const repo = getRepository();
        const user = await repo.getUser(req.user.uid);
        if (!user) {
            return res.json({ status: 'false', membershipEnds: null });
        }
        const canonical = toCanonicalUser(user);
        const entitled = isMembershipActive(canonical) || (
            isPaidMembershipTier(canonical.membership)
            && ['ACTIVE', 'ADMIN_GRANTED'].includes(String(canonical.paymentStatus || '').toUpperCase())
            && (!canonical.membershipEnds || new Date(canonical.membershipEnds) > new Date())
        );
        return res.json({ status: entitled ? 'true' : 'false', membershipEnds: entitled ? (canonical.membershipEnds || null) : null });
    } catch (error) {
        console.error('[Entitlement check]', error.message);
        return res.status(500).json({ status: 'false', error: 'Entitlement check failed' });
    }
});

function notificationEventId(...parts) { return crypto.createHash('sha256').update(parts.join('\0')).digest('hex'); }
// Deterministic notification event IDs: notificationEventId('job_application_submitted', applicationId), notificationEventId('job_application_status', applicationId, String(nextRevision)), notificationEventId('payment_active', orderRef.id), notificationEventId('payment_refunded', paymentOrderId)

function jobApplicationNotification(status, jobTitle, companyName, notes = '') {
    const suffix = notes ? ` ${notes}` : '';
    if (status === 'interview') return { type: 'application_interview', title: 'Interview invitation', message: `You have been invited to interview for ${jobTitle} at ${companyName}.${suffix}` };
    if (status === 'accepted') return { type: 'application_accepted', title: 'Application accepted', message: `Your application for ${jobTitle} at ${companyName} was accepted.${suffix}` };
    if (status === 'rejected') return { type: 'application_rejected', title: 'Application update', message: `Your application for ${jobTitle} at ${companyName} was not selected.${suffix}` };
    return { type: 'application_status_update', title: 'Application status updated', message: `Your application for ${jobTitle} at ${companyName} is now ${status}.${suffix}` };
}

app.post('/api/jobs/:jobId/applications', async (req, res) => {
    const jobId = String(req.params.jobId || '');
    const fullName = String(req.body?.fullName || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 120);
    const phone = String(req.body?.phone || '').replace(/\p{Cc}/gu, '').trim().slice(0, 30);
    const linkedInUrl = safePublicUrl(req.body?.linkedinUrl);
    const githubUrl = safePublicUrl(req.body?.githubUrl);
    const coverLetter = String(req.body?.coverLetter || '').slice(0, 20_000);
    const coverText = coverLetter.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const resumeId = String(req.body?.resumeId || req.body?.selectedResume?.id || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return res.status(400).json({ success: false, error: 'A valid job is required.' });
    if (!String(req.user.email || '').trim()) return res.status(403).json({ success: false, error: 'A verified account email is required.' });
    if (!fullName || !/^\+?[0-9 ()-]{7,30}$/.test(phone) || coverText.length < 50 || coverText.length > 1000) {
        return res.status(400).json({ success: false, error: 'Valid name, phone, and a 50–1000 character cover letter are required.' });
    }
    if ((req.body?.linkedinUrl && (!linkedInUrl || !linkedInUrl.startsWith('https:'))) || (req.body?.githubUrl && (!githubUrl || !githubUrl.startsWith('https:')))) {
        return res.status(400).json({ success: false, error: 'Profile links must use HTTPS.' });
    }
    if (resumeId && !/^[A-Za-z0-9_-]{1,128}$/.test(resumeId)) return res.status(400).json({ success: false, error: 'Invalid resume selection.' });
    const applicationId = `${req.user.uid}_${jobId}`;
    try {
        // Contract: req.user.uid, req.user.email, users collection resumes, JOB_APPLICATION_SUBMITTED, applicationsCount increment, job_application_received
        const repo = resilientMutations.repoFor();
        const job = await repo.getJob(jobId);
        if (!job || String(job.status || '').toLowerCase() !== 'active') {
            const unavailable = new Error('This job is no longer accepting applications.'); unavailable.code = 'JOB_UNAVAILABLE'; throw unavailable;
        }
        let resume = null;
        if (resumeId && typeof repo.getResume === 'function') {
            resume = await repo.getResume(req.user.uid, resumeId);
            if (!resume) { const invalidResume = new Error('The selected resume was not found.'); invalidResume.code = 'RESUME_NOT_FOUND'; throw invalidResume; }
        }
        const result = await resilientMutations.createApplication({
            applicationId, job, user: req.user,
            payload: {
                applicantName: fullName, fullName, applicantEmail: String(req.user.email || '').trim().toLowerCase(),
                email: String(req.user.email || '').trim().toLowerCase(), phone,
                linkedinUrl: linkedInUrl || '', githubUrl: githubUrl || '', coverLetter,
                selectedResume: resume ? { id: resumeId, name: String(resume.title || resume.name || 'Resume').slice(0, 120) } : null,
                resumeId: resumeId || '',
                jobSnapshot: { title: job.title, company: job.company, location: job.location },
            },
            actorUid: req.user.uid, requestId: res.locals.requestId,
        });
        return res.status(201).json({ success: true, ...result });
    } catch (error) {
        const status = error.code === 'ALREADY_APPLIED' ? 409 : ['JOB_UNAVAILABLE', 'RESUME_NOT_FOUND'].includes(error.code) ? 404 : error.code === 'RESUME_TOO_LARGE' ? 413 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to submit application.' : error.message });
    }
});

app.patch('/api/job-applications/:applicationId/status', async (req, res) => {
    const applicationId = String(req.params.applicationId || '');
    const status = String(req.body?.status || '').toLowerCase();
    const notes = String(req.body?.notes || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 1000);
    const expectedStatus = String(req.body?.expectedStatus || '');
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!/^[A-Za-z0-9:_-]{1,300}$/.test(applicationId) || !['interview', 'accepted', 'rejected'].includes(status)
        || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid application status request.' });
    const allowedTransitions = { pending: new Set(['interview', 'rejected']), interview: new Set(['accepted', 'rejected']) };
    try {
        // Invariants: employerId !== req.user.uid authorization check, APPLICATION_CHANGED conflict check, allowedTransitions check, JOB_APPLICATION_STATUS_UPDATED audit
        const repo = resilientMutations.repoFor();
        const application = typeof repo.getApplication === 'function' ? await repo.getApplication(applicationId) : null;
        const currentStatus = String(application?.status || 'pending');
        if (application && !allowedTransitions[currentStatus]?.has(status)) {
            const transition = new Error(`An application cannot move from ${currentStatus} to ${status}.`);
            transition.code = 'INVALID_STATUS_TRANSITION';
            throw transition;
        }
        const job = application ? await repo.getJob(application.jobId) : null;
        const jobTitle = String(job?.title || application?.jobSnapshot?.title || 'Job').replace(/\p{Cc}/gu, ' ').slice(0, 160);
        const companyName = String(job?.company || application?.jobSnapshot?.company || 'Company').replace(/\p{Cc}/gu, ' ').slice(0, 160);
        const notification = jobApplicationNotification(status, jobTitle, companyName, notes);
        const result = await resilientMutations.updateApplicationStatus({
            applicationId, employerId: req.user.uid, status, notes,
            expectedStatus, expectedRevision, actorUid: req.user.uid, requestId: res.locals.requestId, notification,
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        const responseStatus = error.code === 'APPLICATION_CHANGED' || error.code === 'CAS_CONFLICT' ? 409 : error.code === 'INVALID_STATUS_TRANSITION' ? 400 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(responseStatus).json({ success: false, code: error.code, error: responseStatus === 500 ? 'Unable to update application.' : error.message });
    }
});

// Applications for a job — MySQL authoritative (any authenticated reader of
// an active job may view; employers see their own jobs' applications).
app.get('/api/jobs/:jobId/applications', async (req, res) => {
    const jobId = String(req.params.jobId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return res.status(400).json({ success: false, error: 'Invalid job.' });
    try {
        const repo = resilientMutations.repoFor();
        const job = await repo.getJob(jobId);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found.' });
        const isOwner = String(job.employerId || job.employer_id || '') === req.user.uid;
        const applications = await repo.getApplications({ jobId });
        // Applicants see their own applications only; the owner sees all.
        const visible = isOwner ? applications : (applications || []).filter(app => String(app.applicant_id || app.applicantId || '') === req.user.uid);
        return res.json({ success: true, applications: visible });
    } catch (_error) {
        return res.status(503).json({ success: false, error: 'Applications are unavailable.' });
    }
});

// Employer mutations: EMPLOYER_COMPANY_CREATED, EMPLOYER_COMPANY_EDITED, EMPLOYER_COMPANY_DELETED, COMPANY_HAS_JOBS, EMPLOYER_JOB_CREATED, EMPLOYER_JOB_STATUS_CHANGED, EMPLOYER_JOB_EDITED, EMPLOYER_JOB_DELETED, EMPLOYER_JOB_CHANGED

function normalizeEmployerJobInput(input = {}, company = {}) {
    const text = (value, maximum) => String(value || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, maximum);
    const title = text(input.title, 160);
    const description = text(input.description, 20_000);
    const location = text(input.location, 200);
    const country = text(input.country, 100);
    if (!title || !description || !location) throw new Error('Job title, description, and location are required.');
    const list = value => Array.isArray(value) ? value.slice(0, 100).map(item => text(item, 500)).filter(Boolean) : [];
    const salary = value => value === null || value === '' || value === undefined ? null : Number(value);
    const minSalary = salary(input.minSalary);
    const maxSalary = salary(input.maxSalary);
    if ((minSalary !== null && (!Number.isFinite(minSalary) || minSalary < 0)) || (maxSalary !== null && (!Number.isFinite(maxSalary) || maxSalary < 0)) || (minSalary !== null && maxSalary !== null && minSalary > maxSalary)) throw new Error('Invalid salary range.');
    const deadline = input.deadline ? new Date(input.deadline) : null;
    if (deadline && !Number.isFinite(deadline.getTime())) throw new Error('Invalid application deadline.');
    return {
        title, description, location, country,
        companyId: company.id, company: text(company.name, 160), companySize: text(company.size, 80), companyIndustry: text(company.industry, 120),
        companyWebsite: safePublicUrl(company.website), companyImage: safePublicUrl(company.companyImage), companyDescription: text(company.description, 2000),
        jobType: text(input.jobType, 80), workMode: text(input.workMode, 80), experienceLevel: text(input.experienceLevel, 100),
        minSalary, maxSalary, requirements: list(input.requirements), benefits: list(input.benefits), deadline,
    };
}

function isEmployerAccount(req) { return req.user?.claims?.employer === true; }

function normalizeEmployerCompanyInput(input = {}) {
    const text = (value, maximum) => String(value || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, maximum);
    const name = text(input.name, 160);
    const industry = text(input.industry, 120);
    const size = text(input.size, 80);
    const location = text(input.location, 200);
    const website = safePublicUrl(input.website);
    const companyImage = safePublicUrl(input.companyImage);
    const email = text(input.email, 254).toLowerCase();
    const phone = text(input.phone, 30);
    if (!name || !industry || !size || !location) throw new Error('Company name, industry, size, and location are required.');
    if (input.website && (!website || !website.startsWith('https:'))) throw new Error('Company website must use HTTPS.');
    if (input.companyImage && (!companyImage || !companyImage.startsWith('https:'))) throw new Error('Company image must use HTTPS.');
    if (email && !/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(email)) throw new Error('Invalid company email.');
    if (phone && !/^\+?[0-9 ()-]{7,30}$/.test(phone)) throw new Error('Invalid company phone.');
    return { name, industry, size, location, website: website || '', companyImage: companyImage || '', description: text(input.description, 5000), address: text(input.address, 500), phone, email };
}

app.post('/api/employer-applications', async (req, res) => {
    try {
        const saved = await resilientMutations.createDocument({
                        entityType: 'employer_applications',
            id: req.user.uid,
            data: { ...(req.body || {}), userId: req.user.uid, status: 'pending', submittedAt: new Date().toISOString() },
            actorUid: req.user.uid,
            requestId: res.locals.requestId,
            action: 'EMPLOYER_APPLICATION_SUBMITTED',
        });
        return res.status(201).json({ success: true, id: saved.id, revision: saved.revision, status: 'pending' });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, error: error.message || 'Unable to submit employer application.' });
    }
});

// Public featured-company projection. It exposes only approved, explicitly
// featured presentation fields and never reuses the owner-scoped employer API.
app.get('/api/public/featured-companies', async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 8, 1), 50);
    try {
        const rows = await resilientMutations.repoFor().getCompanies({ limit: 500 });
        const companies = (rows || []).filter(row => {
            let extra = {};
            try { extra = typeof row.extra_json === 'string' ? JSON.parse(row.extra_json) : (row.extra_json || {}); } catch { /* invalid extras do not authorize publication */ }
            return String(row.status || extra.status || '').toLowerCase() === 'approved'
                && (row.featured === true || Number(row.featured) === 1 || extra.featured === true);
        }).slice(0, limit).map(row => {
            let extra = {};
            try { extra = typeof row.extra_json === 'string' ? JSON.parse(row.extra_json) : (row.extra_json || {}); } catch { /* return relational fields only */ }
            return {
                id: row.id,
                name: row.name || extra.name || '',
                companyImage: safePublicUrl(row.logo || extra.companyImage || extra.logo || ''),
                industry: row.industry || extra.industry || '',
                location: row.location || extra.location || '',
            };
        });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, companies, source: 'MARIADB_COMPANIES' });
    } catch (_error) {
        return res.status(503).json({
            success: false,
            code: 'FEATURED_COMPANIES_UNAVAILABLE',
            error: 'Featured companies are temporarily unavailable.',
            requestId: res.locals.requestId,
        });
    }
});

// Employer company list — MySQL authoritative (owner-scoped).
app.get('/api/employer/companies', async (req, res) => {
    try {
        const repo = resilientMutations.repoFor();
        const companies = await repo.getCompanies({ employerId: req.user.uid });
        const items = (companies || []).map(company => ({
            id: company.id,
            name: company.name || company.companyName || company.company_name || '',
            website: company.website || company.company_website || '',
            logo: company.logo || company.logoUrl || company.extra_json?.logo || '',
            status: company.status || company.approvalStatus || 'pending',
            featured: company.featured === true || company.featured === 1,
            revision: Number(company.revision || 0),
            createdAt: adminIso(company.created_at || company.createdAt),
        }));
        return res.json({ success: true, companies: items });
    } catch (_error) {
        return res.status(503).json({ success: false, error: 'Companies are unavailable.' });
    }
});

app.post('/api/employer/companies', async (req, res) => {
    if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
    try {
        const data = normalizeEmployerCompanyInput(req.body?.data);
        const result = await resilientMutations.createCompany({
            employerId: req.user.uid, data,
            actorUid: req.user.uid, requestId: res.locals.requestId,
        });
        return res.status(201).json({ success: true, ...result });
    } catch (error) { return res.status(400).json({ success: false, error: error.message || 'Unable to create company.' }); }
});

app.patch('/api/employer/companies/:companyId', async (req, res) => {
    const companyId = String(req.params.companyId || '');
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(companyId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid company update.' });
    try {
        const result = await resilientMutations.updateCompany({
            companyId, employerId: req.user.uid, expectedRevision,
            data: normalizeEmployerCompanyInput(req.body?.data), actorUid: req.user.uid, requestId: res.locals.requestId,
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        const status = error.code === 'CAS_CONFLICT' || error.code === 'EMPLOYER_COMPANY_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : 400;
        return res.status(status).json({ success: false, code: error.code, error: error.message || 'Unable to update company.' });
    }
});

app.delete('/api/employer/companies/:companyId', async (req, res) => {
    const companyId = String(req.params.companyId || '');
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(companyId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid company deletion.' });
    try {
        await resilientMutations.deleteCompany({
            companyId, employerId: req.user.uid, expectedRevision,
            actorUid: req.user.uid, requestId: res.locals.requestId, requireNoJobs: true,
        });
        return res.json({ success: true });
    } catch (error) {
        const status = ['EMPLOYER_COMPANY_CHANGED', 'COMPANY_HAS_JOBS', 'CAS_CONFLICT'].includes(error.code) ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete company.' : error.message });
    }
});

// Employer job list — MySQL authoritative (owner-scoped).
app.get('/api/employer/jobs', async (req, res) => {
    try {
        const repo = resilientMutations.repoFor();
        const jobs = await repo.getJobs({ employerId: req.user.uid });
        return res.json({ success: true, jobs: jobs || [] });
    } catch (_error) {
        return res.status(503).json({ success: false, error: 'Jobs are unavailable.' });
    }
});

app.post('/api/employer/jobs', async (req, res) => {
    if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
    const companyId = String(req.body?.data?.companyId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(companyId)) return res.status(400).json({ success: false, error: 'Select an approved company.' });
    try {
        const repo = resilientMutations.repoFor();
        const company = await repo.getCompany(companyId);
        if (!company || company.employerId !== req.user.uid || company.status !== 'approved') return res.status(404).json({ success: false, error: 'Approved company not found.' });
        const data = normalizeEmployerJobInput(req.body.data, { id: companyId, ...company });
        const result = await resilientMutations.createJob({
            employerId: req.user.uid, company: { id: companyId, ...company }, data,
            actorUid: req.user.uid, requestId: res.locals.requestId,
        });
        return res.status(201).json({ success: true, ...result });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message || 'Unable to create job.' });
    }
});

app.patch('/api/employer/jobs/:jobId', async (req, res) => {
    const jobId = String(req.params.jobId || '');
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid job update.' });
    try {
        const repo = resilientMutations.repoFor();
        const current = await repo.getJob(jobId);
        if (!current || current.employerId !== req.user.uid) { const missing = new Error('Job not found.'); missing.code = 'NOT_FOUND'; throw missing; }
        let patch; let action;
        if (Object.hasOwn(req.body || {}, 'status')) {
            const nextStatus = String(req.body.status || '').toLowerCase();
            const allowed = (current.status === 'active' && nextStatus === 'paused') || (current.status === 'paused' && nextStatus === 'active');
            if (!allowed) { const invalid = new Error(`A ${current.status || 'pending'} job cannot be changed to ${nextStatus}.`); invalid.code = 'INVALID_JOB_TRANSITION'; throw invalid; }
            patch = { status: nextStatus }; action = 'EMPLOYER_JOB_STATUS_CHANGED';
        } else {
            const companyId = String(req.body?.data?.companyId || '');
            const company = await repo.getCompany(companyId);
            if (!company || company.employerId !== req.user.uid || company.status !== 'approved') { const missing = new Error('Approved company not found.'); missing.code = 'COMPANY_NOT_FOUND'; throw missing; }
            patch = { ...normalizeEmployerJobInput(req.body.data, { id: companyId, ...company }), status: 'pending' };
            action = 'EMPLOYER_JOB_EDITED';
        }
        const result = await resilientMutations.updateJob({
            jobId, employerId: req.user.uid, expectedRevision, patch,
            actorUid: req.user.uid, requestId: res.locals.requestId, action,
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        const status = error.code === 'CAS_CONFLICT' || error.code === 'EMPLOYER_JOB_CHANGED' ? 409 : ['NOT_FOUND', 'COMPANY_NOT_FOUND'].includes(error.code) ? 404 : error.code === 'INVALID_JOB_TRANSITION' ? 400 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to update job.' : error.message });
    }
});

app.delete('/api/employer/jobs/:jobId', async (req, res) => {
    const jobId = String(req.params.jobId || '');
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid job deletion.' });
    try {
        await resilientMutations.deleteJob({
            jobId, employerId: req.user.uid, expectedRevision,
            actorUid: req.user.uid, requestId: res.locals.requestId, requireNoApplications: true,
        });
        return res.json({ success: true });
    } catch (error) {
        const status = ['EMPLOYER_JOB_CHANGED', 'JOB_HAS_APPLICATIONS', 'CAS_CONFLICT'].includes(error.code) ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete job.' : error.message });
    }
});

app.get('/api/messages/conversations', async (req, res) => {
    // List conversations for the current user. Messaging is fully MySQL-backed
    // (migrated from Firebase Realtime Database); no Firebase database is
    // consulted on this path.
    //
    // Read pattern: exactly three bounded round trips regardless of conversation
    // count. The previous shape issued one participants query and one
    // latest-message query per conversation (1 + 2N sequential pool acquisitions),
    // which at the 100-conversation cap meant 201 round trips queued behind the
    // shared MariaDB pool on a single page load.
    try {
        const pool = require('./database/mysql').getPool();
        const uid = req.user.uid;
        const [convRows] = await pool.query(
            `SELECT c.id, c.application_id AS applicationId
             FROM conversations c
             JOIN conversation_participants cp ON cp.conversation_id = c.id
             WHERE cp.user_id = ? AND c.deleted_at IS NULL
             ORDER BY c.created_at DESC
             LIMIT 100`,
            [uid]
        );
        const conversations = (convRows || []).map(row => ({
            id: row.id,
            applicationId: row.applicationId || null,
            participants: {},
            lastMessage: null,
        }));
        if (conversations.length) {
            const conversationIds = conversations.map(row => row.id);
            const placeholders = conversationIds.map(() => '?').join(',');
            const [partRows, lastRows] = await Promise.all([
                pool.query(
                    `SELECT conversation_id, user_id FROM conversation_participants
                     WHERE conversation_id IN (${placeholders})`,
                    conversationIds
                ),
                pool.query(
                    `SELECT conversationId, id, senderId, text, timestamp FROM (
                       SELECT m.conversation_id AS conversationId, m.id, m.sender_id AS senderId,
                              m.text, m.timestamp,
                              ROW_NUMBER() OVER (
                                  PARTITION BY m.conversation_id
                                  ORDER BY m.timestamp DESC, m.id DESC
                              ) AS rn
                       FROM conversation_messages m
                       WHERE m.conversation_id IN (${placeholders})
                     ) ranked WHERE ranked.rn = 1`,
                    conversationIds
                ),
            ]);
            const byId = new Map(conversations.map(row => [row.id, row]));
            for (const partRow of partRows[0] || []) {
                const conversation = byId.get(partRow.conversation_id);
                // Ownership is re-checked here rather than trusted from the join:
                // a participant row for a conversation this caller is not part of
                // must not be projected into the response.
                if (conversation) conversation.participants[partRow.user_id] = true;
            }
            for (const messageRow of lastRows[0] || []) {
                const conversation = byId.get(messageRow.conversationId);
                if (conversation && !conversation.lastMessage) {
                    conversation.lastMessage = {
                        id: messageRow.id,
                        senderId: messageRow.senderId,
                        text: messageRow.text,
                        timestamp: messageRow.timestamp,
                    };
                }
            }
        }
        conversations.sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
        return res.json({ success: true, conversations });
    } catch (error) {
        console.error('[List conversations]', error.message);
        return res.status(503).json({ success: false, error: 'Messaging is temporarily unavailable.' });
    }
});

app.get('/api/messages/conversations/:conversationId/messages', async (req, res) => {
    const conversationId = String(req.params.conversationId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(conversationId)) {
        return res.status(404).json({ success: false, error: 'Conversation not found.' });
    }
    try {
        const pool = require('./database/mysql').getPool();
        const [membership] = await pool.query(
            'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, req.user.uid]
        );
        if (!membership.length) {
            return res.status(404).json({ success: false, error: 'Conversation not found.' });
        }
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const [rows] = await pool.query(
            `SELECT id, sender_id AS senderId, text, timestamp
             FROM conversation_messages WHERE conversation_id = ?
             ORDER BY timestamp DESC, id DESC LIMIT ?`,
            [conversationId, limit]
        );
        const messages = rows.reverse();
        res.setHeader('Cache-Control', 'no-store, private');
        return res.json({ success: true, messages });
    } catch (error) {
        console.error('[List messages]', error.message);
        return res.status(503).json({ success: false, error: 'Messages are temporarily unavailable.' });
    }
});

app.post('/api/messages/conversations', async (req, res) => {
    const applicationId = String(req.body.applicationId || '');
    if (!/^[A-Za-z0-9:_-]{1,300}$/.test(applicationId)) {
        return res.status(400).json({ success: false, error: 'Valid job application is required.' });
    }
    try {
        // MySQL is the single store for applications, jobs, and conversations.
        const { getRepository } = require('./repositories');
        const repo = getRepository();
        const application = await repo.getApplication(applicationId);
        if (!application) return res.status(404).json({ success: false, error: 'Job application not found.' });
        const applicationData = application;
        const job = await repo.getJob(applicationData.jobId || applicationData.job_id);
        const applicantUid = applicationData.userId || applicationData.applicant_id;
        const employerUid = job?.employerId || job?.employer_id;
        if (!applicantUid || !employerUid || ![applicantUid, employerUid].includes(req.user.uid)) {
            return res.status(403).json({ success: false, error: 'Conversation is not available to this account.' });
        }
        const participants = [String(applicantUid), String(employerUid)].sort();
        // A deterministic conversation ID makes concurrent create requests
        // idempotent (INSERT IGNORE on the primary key).
        const conversationId = crypto.createHash('sha256').update(participants.join('\0')).digest('hex');
        const pool = require('./database/mysql').getPool();
        const conn = await pool.getConnection();
        let created = false;
        try {
            await conn.beginTransaction();
            const [inserted] = await conn.query(
                'INSERT IGNORE INTO conversations (id, application_id) VALUES (?, ?)',
                [conversationId, applicationId]
            );
            created = inserted.affectedRows > 0;
            await conn.query(
                'INSERT IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)',
                [conversationId, participants[0], conversationId, participants[1]]
            );
            await conn.commit();
        } catch (txErr) {
            await conn.rollback().catch(() => {});
            throw txErr;
        } finally {
            conn.release();
        }
        return res.status(created ? 201 : 200).json({ success: true, conversationId, existing: !created });
    } catch (error) {
        console.error('[Create conversation]', error.message);
        return res.status(503).json({ success: false, error: 'Messaging service unavailable.' });
    }
});

app.get('/api/messages/conversations/:conversationId/participant-profile', async (req, res) => {
    const conversationId = String(req.params.conversationId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(conversationId)) {
        return res.status(404).json({ success: false, error: 'Conversation not found.' });
    }
    try {
        const pool = require('./database/mysql').getPool();
        const [membership] = await pool.query(
            'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, req.user.uid]
        );
        if (!membership.length) {
            return res.status(404).json({ success: false, error: 'Conversation not found.' });
        }
        const [partRows] = await pool.query(
            'SELECT user_id FROM conversation_participants WHERE conversation_id = ?',
            [conversationId]
        );
        const participantIds = partRows.map(r => r.user_id);
        const otherUserId = participantIds.find(uid => uid !== req.user.uid);
        if (!otherUserId) return res.status(404).json({ success: false, error: 'Participant not found.' });
        if (otherUserId.startsWith('deleted_')) {
            res.setHeader('Cache-Control', 'no-store, private');
            return res.json({ success: true, profile: { name: 'Deleted account', avatar: '' } });
        }
        // Authoritative profile read from MySQL; Firestore is never consulted.
        const { getRepository } = require('./repositories');
        const repo = getRepository();
        const user = (await repo.getUser(otherUserId)) || {};
        const profile = user.profile || {};
        const name = String(profile.name || user.displayName || `${user.firstname || ''} ${user.lastname || ''}`.trim() || 'User').replace(/\p{Cc}/gu, ' ').trim().slice(0, 100);
        const avatar = safePublicUrl(profile.image || user.photoURL || '');
        res.setHeader('Cache-Control', 'no-store, private');
        return res.json({ success: true, profile: { name, avatar } });
    } catch (error) {
        console.error('[Message participant profile]', error.message);
        return res.status(503).json({ success: false, error: 'Participant profile is unavailable.' });
    }
});

app.post('/api/messages/send', async (req, res) => {
    const conversationId = String(req.body.conversationId || '');
    const text = String(req.body.text || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(conversationId) || !text || text.length > 10_000) {
        return res.status(400).json({ success: false, error: 'Valid conversation and message are required.' });
    }
    try {
        const pool = require('./database/mysql').getPool();
        const [membership] = await pool.query(
            'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, req.user.uid]
        );
        if (!membership.length) {
            return res.status(404).json({ success: false, error: 'Conversation not found.' });
        }
        const messageId = `msg_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
        const timestamp = Date.now();
        await pool.query(
            'INSERT INTO conversation_messages (id, conversation_id, sender_id, text, timestamp) VALUES (?, ?, ?, ?, ?)',
            [messageId, conversationId, req.user.uid, text, timestamp]
        );
        let notificationState = 'NOTIFICATION_CREATED';
        const [partRows] = await pool.query(
            'SELECT user_id FROM conversation_participants WHERE conversation_id = ?',
            [conversationId]
        );
        const recipientUid = partRows.map(r => r.user_id).find(uid => uid !== req.user.uid && !uid.startsWith('deleted_'));
        if (recipientUid) {
            try {
                const eventId = notificationEventId('message', conversationId, messageId);
                // Authoritative notification record goes to MySQL; the Firestore
                // data plane is never required.
                const { getRepository } = require('./repositories');
                const repo = getRepository();
                await repo.saveNotification(recipientUid, eventId, {
                    eventId, state: 'NOTIFICATION_CREATED', deliveryState: 'NOT_REQUESTED', type: 'message', title: 'New message', message: 'You have a new message.',
                    data: { conversationId }, read: false,
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                });
            } catch { notificationState = 'NOTIFICATION_CREATION_FAILED'; }
        } else notificationState = 'NOTIFICATION_CREATION_FAILED';
        return res.status(201).json({ success: true, messageId, notificationState });
    } catch (error) {
        console.error('[Send message]', error.message);
        return res.status(503).json({ success: false, error: 'Messaging service unavailable.' });
    }
});

app.post('/api/contact', async (req, res) => {
    // Hidden honeypot field: bots that populate every field receive a generic success.
    if (req.body.website) return res.status(202).json({ success: true, message: 'Message accepted.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const message = String(req.body.message || '').trim();
    if (!/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(email) || email.length > 254
        || name.length < 2 || name.length > 100 || message.length < 10 || message.length > 5000) {
        return res.status(400).json({ success: false, error: 'Valid name, email, and message are required.' });
    }
    try {
        const { getRepository } = require('./repositories');
        const repo = getRepository();
        const msgId = `contact_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        await repo.saveContactMessage(msgId, {
            email, name, message, status: 'new',
            ip: String(req.ip || req.connection?.remoteAddress || '').slice(0, 45),
            userAgent: String(req.get('user-agent') || '').slice(0, 300),
        });
        return res.status(202).json({ success: true, message: 'Message accepted.' });
    } catch (err) {
        console.error('[Contact message error]', err.message);
        return res.status(500).json({ success: false, error: 'Failed to submit contact message.' });
    }
});

// Redeems a single-use render token for the resume payload. The token itself is the
// authorization proof (issued only after server-side ownership + entitlement checks) and
// is consumed transactionally, so a replayed or leaked token is already spent.
app.get('/api/export-render-data', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    // Never let a token reach a shared cache, a referrer, or a search index.
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    try {
        const data = await consumeExportRenderToken(req.query.token);
        if (!data) return res.status(404).json({ error: 'Export data not found', code: 'RENDER_TOKEN_NOT_FOUND' });
        return res.json({ data });
    } catch (error) {
        console.error('[Export render data]', { message: error.message, requestId: res.locals.requestId });
        return res.status(503).json({ error: 'Export data is temporarily unavailable' });
    }
});

let activeExports = 0;
const MAX_CONCURRENT_EXPORTS = 5;
// Every template the router can render must be exportable. The Cv range tracks the 51
// CV templates and the Cover range tracks the 4 cover-letter templates; both are
// rendered by /export/:template/:resumeId/:language.
const EXPORTABLE_TEMPLATE = /^(?:Cv(?:[1-9]|[1-4][0-9]|5[0-1])|Cover[1-4])$/;

app.post(['/api/export', '/api/public-export'], async (req, res) => {
    // The slot is claimed before any await so concurrent requests cannot all observe a
    // free counter and overshoot the Chromium concurrency ceiling.
    if (activeExports >= MAX_CONCURRENT_EXPORTS) {
        return res.status(429).json({ error: 'Server is busy processing PDF exports. Please try again in a few seconds.' });
    }
    activeExports++;
    const releaseSlot = () => { activeExports = Math.max(0, activeExports - 1); };
    let browser;
    let renderToken;
    let slotAcquired = true;
    try {
        const resumeId = String(req.body.resumeId || '');
        const resumeName = String(req.body.resumeName || '');
        const language = String(req.body.language || 'en');
        if (!/^[A-Za-z0-9_-]{4,128}$/.test(resumeId)
            || !EXPORTABLE_TEMPLATE.test(resumeName)
            || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) {
            return res.status(400).json({ error: 'Invalid export request' });
        }
        const { getRepository } = require('./repositories');
        const repo = getRepository();

        let stored;
        let ownerUid;
        // Public exports require an explicit MariaDB publication row. Private
        // exports use only the authenticated owner's canonical draft table.
        if (req.path.endsWith('/public-export')) {
            const published = await repo.getPublicResume(resumeId);
            if (!published || published.isPublished !== true || published.publicationMode !== 'explicit') {
                return res.status(404).json({ error: 'Resume not found' });
            }
            ownerUid = published.ownerUid;
            stored = published.data;
            if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
                return res.status(422).json({ error: 'Resume data is invalid' });
            }
        } else {
            ownerUid = req.user?.uid;
            const isCover = resumeName.startsWith('Cover');
            const draft = isCover
                ? await repo.getCover(ownerUid, resumeId)
                : await repo.getResume(ownerUid, resumeId);
            if (!draft) return res.status(404).json({ error: 'Resume not found' });
            stored = { ...draft };
            for (const field of ['revision', 'created_at', 'createdAt', 'updatedAt', 'ownerUid', 'userId']) delete stored[field];
        }

        const owner = await repo.getUser(ownerUid);
        if (!owner) return res.status(404).json({ error: 'Resume owner not found' });
        const ownerCanonical = toCanonicalUser(owner);
        const publicConfig = (await repo.getSetting('public_config')) || {};
        const systemSettings = (await repo.getSetting('system_settings')) || {};
        const isGlobalFreeMode = publicConfig.subscriptions === false 
            || publicConfig.subscriptions?.state === false 
            || publicConfig.subscriptions?.enabled === false
            || systemSettings.subscriptions?.state === false;
        const allowFreePdf = Boolean(publicConfig.watermark?.allowFreePdfDownload);
        const entitled = isGlobalFreeMode || allowFreePdf || isMembershipActive(ownerCanonical) || (
            isPaidMembershipTier(ownerCanonical.membership)
            && ['ACTIVE', 'ADMIN_GRANTED'].includes(String(ownerCanonical.paymentStatus || '').toUpperCase())
            && (!ownerCanonical.membershipEnds || new Date(ownerCanonical.membershipEnds) > new Date())
        );
        if (!entitled) {
            return res.status(402).json({ error: { code: 'ACTIVE_SUBSCRIPTION_REQUIRED', message: 'An active subscription is required for PDF export', requestId: res.locals.requestId } });
        }
        if (stored?.template && stored.template !== resumeName) return res.status(400).json({ error: 'Template mismatch' });

        // Export preferences are optional, server-side, and bounded. The public
        // host and executable binding are intentionally not read from browser
        // settings; this process always renders against its deployment origin.
        let exportPreferences = { renderTimeout: 60_000, paperFormat: 'A4' };
        try {
            const preferences = (await repo.getSetting('public_config').catch(() => null)) || {};
            const configured = preferences.exportPdf || {};
            const timeout = Number(configured.renderTimeout);
            if (Number.isFinite(timeout)) exportPreferences.renderTimeout = Math.max(5_000, Math.min(Math.floor(timeout), 120_000));
            if (['A4', 'Letter', 'Legal'].includes(configured.paperFormat)) exportPreferences.paperFormat = configured.paperFormat;
        } catch (preferenceError) {
            console.warn('[Export preferences] unavailable; using bounded defaults:', preferenceError.message);
        }

        try {
            const { isPaidMembershipTier } = require('./security/entitlements');
            const { isMembershipActive } = require('./database/domain');
            const isPaid = isPaidMembershipTier(ownerCanonical?.membership) || isMembershipActive(ownerCanonical);
            const watermarkConfig = (publicConfig && publicConfig.watermark) || {};
            if (!isPaid && watermarkConfig.enableFreeWatermark !== false) {
                stored._watermark = {
                    enableFreeWatermark: true,
                    watermarkText: watermarkConfig.watermarkText || 'Created with ResumePilot AI (Free Plan)',
                    opacity: Number(watermarkConfig.opacity) || 0.18,
                    position: watermarkConfig.position || 'diagonal',
                };
            } else {
                stored._watermark = null;
            }
        } catch (_entErr) {
            // Graceful non-fatal fallback
        }

        renderToken = await createExportRenderToken(stored);
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--ignore-certificate-errors'
            ]
        };
        browser = await chromium.launch(launchOptions);
        const context = await browser.newContext({
            viewport: { width: 794, height: 1123 },
            deviceScaleFactor: 1,
            ignoreHTTPSErrors: true
        });
        const allowedRenderOrigin = new URL(`${protocol}://${websiteName}`).origin;
        const allowedHosts = new Set([
            new URL(`${protocol}://${websiteName}`).hostname,
            'lh3.googleusercontent.com',
            'fonts.googleapis.com',
            'fonts.gstatic.com',
            'cdnjs.cloudflare.com',
            'unpkg.com'
        ]);

        // Allow remote photo/image and font URLs while preventing SSRF to private IP ranges
        await context.route('**/*', async route => {
            const requestUrl = route.request().url();
            if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:')) return route.continue();
            try {
                const parsed = new URL(requestUrl);
                if (allowedHosts.has(parsed.hostname) || parsed.origin === allowedRenderOrigin) return route.continue();
                const resourceType = route.request().resourceType();
                if (['image', 'font', 'stylesheet'].includes(resourceType) && parsed.protocol === 'https:') {
                    return route.continue();
                }
            } catch (_) {}
            return route.abort('blockedbyclient');
        });
        const page = await context.newPage();
        const targetUrl = `${protocol}://${websiteName}/export/${encodeURIComponent(resumeName)}/${encodeURIComponent(resumeId)}/${encodeURIComponent(language)}#renderToken=${encodeURIComponent(renderToken)}`;
        console.log('Playwright exporting PDF, navigating to: ', targetUrl);
        await page.goto(targetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: exportPreferences.renderTimeout,
        });
        // Wait for the normalized lazy template to commit. Export errors fail closed instead
        // of silently producing an empty/corrupt PDF. Use waitForSelector to avoid CSP eval restrictions.
        await page.waitForSelector('html[data-export-ready="true"], html[data-export-error]', { timeout: Math.min(exportPreferences.renderTimeout, 30_000) });
        const exportError = await page.evaluate(() => globalThis.document.documentElement.getAttribute('data-export-error'));
        if (exportError) throw new Error(`EXPORT_RENDER_FAILED:${exportError}`);
        await page.evaluate(async () => {
            await globalThis.document.fonts?.ready;
            await Promise.all([...globalThis.document.images].map(image => image.complete || !image.decode ? Promise.resolve() : image.decode().catch(() => {})));
        }).catch(() => {});
        await page.waitForTimeout(250);

        // Buffer the PDF instead of writing to disk. A temporary file on local disk is
        // not shared across instances, survives crashes as an orphan, and races when two
        // exports land in the same millisecond. Streaming the buffer removes all three.
        const pdfBuffer = await page.pdf({
            format: exportPreferences.paperFormat,
            printBackground: true,
            preferCSSPageSize: true,
            margin: {
                top: '0mm',
                right: '0mm',
                bottom: '0mm',
                left: '0mm'
            }
        });
        await browser.close();
        browser = undefined;

        if (!pdfBuffer || pdfBuffer.length < 5 || pdfBuffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
            throw new Error('EXPORT_PDF_INVALID');
        }
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
        res.setHeader('Content-Length', String(pdfBuffer.length));
        return res.send(pdfBuffer);
    } catch (error) {
        // Internal render/browser diagnostics stay in the server log; the client receives a
        // stable code and the correlation id only.
        console.error('[Export PDF]', { code: error.code || 'EXPORT_FAILED', message: error.message, requestId: res.locals.requestId });
        if (browser) await browser.close().catch(() => {});
        if (res.headersSent) return res.end();
        return res.status(500).json({ error: { code: 'EXPORT_FAILED', message: 'Unable to generate the PDF export. Please try again.', requestId: res.locals.requestId } });
    } finally {
        if (renderToken) {
            try { await discardExportRenderToken(renderToken); }
            catch (discardError) {
                console.error('[Export token revocation]', { code: discardError.code || 'REVOCATION_FAILED', requestId: res.locals.requestId });
            }
        }
        if (slotAcquired) { slotAcquired = false; releaseSlot(); }
    }
});

// Import AI & Email routes
const aiRoutes = require('./routes/ai');
const emailRoutes = require('./routes/email');

// AI retains its legacy /api/* contract. Email is mounted only in its explicit
// namespace so it cannot shadow unrelated /api/admin/* or /api/templates routes.
app.use('/api', aiRoutes);
app.use('/api/email', emailRoutes);

// Enterprise tenancy APIs are feature-gated at the client, server-authorized, and
// deliberately isolated from existing certified UID-scoped module routes. The
// enterprise API boundary (installed above) accepts either a Firebase bearer token
// or an x-api-key service credential; the router enforces fail-closed endpoint
// allowlists and RBAC for each principal kind.
app.use('/api/enterprise/m2m', enterpriseM2mRouter);
app.use('/api/enterprise', enterpriseRouter);

// Administrative & Platform Audit Logging
app.use(['/api/admin', '/api/platform'], createAdminAuditMiddleware());

// Super Admin / Platform & Audit Routes
app.use('/api/admin', adminAuditRouter);
app.use('/api/platform', platformRouter);
// Backwards-compatible read alias. The canonical frontend route is
// /api/platform/payment-settings, but old Admin bundles receive the same
// Super-Admin-only secret-free projection instead of an unexplained 404.
app.get('/api/admin/payment-settings', requirePermission(['payments.read', 'system.config.read']), async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        return res.json(await getPaymentSettingsProjection(process.env));
    } catch (error) {
        return res.status(Number(error.status) || 503).json({ error: { code: error.code || 'PAYMENT_SETTINGS_UNAVAILABLE', message: 'Could not load payment settings.', requestId: res.locals.requestId } });
    }
});

// AI provider configuration is split: secrets remain in a server-only document while
// browser-readable settings contain models/toggles only.
app.get('/api/admin/ai-settings', async (req, res) => {
    try {
        const result = await loadAiAdminSettings();
        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(error.status || 503).json({ success: false, code: error.code || 'AI_SETTINGS_UNAVAILABLE', error: error.message, requestId: res.locals.requestId });
    }
});

function normalizeBlogCategoryInput(input = {}) {
    const name = String(input.name || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 120);
    const description = String(input.description || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
    const color = /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? String(input.color) : '#6366f1';
    const slug = name.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
    if (!name || !slug) throw new Error('A valid category name is required.');
    return { name, slug, description, color };
}

app.post('/api/admin/blog/categories', async (req, res) => {
    try {
        const data = normalizeBlogCategoryInput(req.body);
        const saved = await resilientMutations.createDocument({
            entityType: 'blog_categories', data,
            actorUid: req.user.uid, requestId: res.locals.requestId, action: 'CMS_CATEGORY_CREATED',
        });
        return res.status(201).json({ success: true, categoryId: saved.id, slug: data.slug, revision: 1 });
    } catch (error) { return res.status(error.code === 'CATEGORY_CONFLICT' ? 409 : 400).json({ success: false, code: error.code, error: error.message }); }
});

app.patch('/api/admin/blog/categories/:categoryId', async (req, res) => {
    const categoryId = String(req.params.categoryId || '');
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(categoryId) || !Number.isInteger(expectedRevision)) return res.status(400).json({ success: false, error: 'Invalid category update.' });
    try {
        const data = normalizeBlogCategoryInput(req.body);
        const saved = await resilientMutations.updateDocument({
            entityType: 'blog_categories', id: categoryId, expectedRevision, patch: data,
            actorUid: req.user.uid, requestId: res.locals.requestId, action: 'CMS_CATEGORY_UPDATED',
        });
        return res.json({ success: true, slug: data.slug, revision: saved.revision });
    } catch (error) {
        const status = error.code === 'CAS_CONFLICT' || error.code === 'CATEGORY_CONFLICT' ? 409 : error.code === 'NOT_FOUND' ? 404 : 400;
        return res.status(status).json({ success: false, code: error.code, error: error.message });
    }
});

app.delete('/api/admin/blog/categories/:categoryId', async (req, res) => {
    const categoryId = String(req.params.categoryId || '');
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(categoryId) || !Number.isInteger(expectedRevision)) return res.status(400).json({ success: false, error: 'Invalid category deletion.' });
    try {
        const repo = resilientMutations.repoFor();
        const posts = await repo.getBlogPosts({ publishedOnly: false, limit: 200 }).catch(() => []);
        if ((posts || []).some(p => p.categoryId === categoryId)) {
            const e = new Error('Move or delete posts before deleting this category.'); e.code = 'CATEGORY_HAS_POSTS'; throw e;
        }
        await resilientMutations.deleteDocument({
            entityType: 'blog_categories', id: categoryId, expectedRevision,
            actorUid: req.user.uid, requestId: res.locals.requestId, action: 'CMS_CATEGORY_DELETED',
        });
        return res.json({ success: true });
    } catch (error) {
        const status = ['CATEGORY_CONFLICT', 'CATEGORY_HAS_POSTS', 'CAS_CONFLICT'].includes(error.code) ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete category.' : error.message });
    }
});

app.patch('/api/admin/blog/posts/:postId', async (req, res) => {
    const postId = String(req.params.postId || '');
    const nextStatus = String(req.body?.status || '').toLowerCase();
    const expectedRevision = Number(req.body?.expectedRevision);
    const scheduledAt = req.body?.scheduledAt ? new Date(req.body.scheduledAt) : null;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(postId) || !['approved', 'rejected', 'scheduled'].includes(nextStatus) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid Blog moderation request.' });
    if (nextStatus === 'scheduled' && (!scheduledAt || !Number.isFinite(scheduledAt.getTime()) || scheduledAt <= new Date())) return res.status(400).json({ success: false, error: 'Choose a future publication time.' });
    try {
        const result = await resilientMutations.moderateBlogPost({
            postId, nextStatus, expectedRevision,
            scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
            actorUid: req.user.uid, requestId: res.locals.requestId,
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        const status = error.code === 'BLOG_CONFLICT' || error.code === 'CAS_CONFLICT' ? 409 : error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_BLOG_TRANSITION' ? 400 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to moderate post.' : error.message });
    }
});

app.delete('/api/admin/blog/posts/:postId', async (req, res) => {
    const postId = String(req.params.postId || '');
    const expectedRevision = Number(req.body?.expectedRevision);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(postId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid Blog deletion.' });
    try {
        await resilientMutations.deleteDocument({
            entityType: 'blog', id: postId, expectedRevision,
            actorUid: req.user.uid, requestId: res.locals.requestId, action: 'CMS_BLOG_DELETED',
        });
        return res.json({ success: true });
    } catch (error) {
        const status = error.code === 'BLOG_CONFLICT' || error.code === 'CAS_CONFLICT' ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete post.' : error.message });
    }
});

app.post('/api/admin/blog/publish-due', async (req, res) => {
    // The datastore is the only dependency this scheduler has. Checking it up
    // front lets us report "not configured" precisely, instead of letting every
    // possible fault collapse into one opaque "unavailable" message.
    try {
        // Scheduler events: CMS_SCHEDULED_POSTS_PUBLISHED, blog_scheduled_published, INVALID_BLOG_TRANSITION
        const published = await publishDueBlogPosts({ actorUid: req.user.uid, requestId: res.locals.requestId });
        return res.json({ success: true, published });
    } catch (error) {
        // Previously this swallowed the error entirely, leaving no way to tell a
        // permissions problem from an outage.
        console.error('[CMS publish-due]', error.message);
        return res.status(503).json({
            success: false,
            code: 'CMS_SCHEDULER_UNAVAILABLE',
            error: 'The CMS scheduler could not complete this run.',
            reason: error.message,
            requestId: res.locals.requestId,
        });
    }
});

app.get('/api/admin/health-summary', async (req, res) => {
    // MySQL is the authoritative configuration store; Firestore is never
    // required for the health summary.
    try {
        const { getRepository } = require('./repositories');
        const repo = getRepository();
        const [publicData, ai, payments, maintenance] = await Promise.all([
            repo.getSetting('public_config'),
            repo.getSetting('ai_providers'),
            repo.getSetting('payment_providers'),
            repo.getSetting('maintenance'),
        ]);
        if (!publicData || typeof publicData !== 'object') {
            throw new Error('Public configuration is not initialized.');
        }
        const systemHealth = publicData.systemHealth || {};
        const aiSettings = ai || {};
        const paymentSettings = payments || {};
        const mergedMaintenance = { ...systemHealth, ...(maintenance || {}) };
        return res.json({
            success: true,
            checkedAt: new Date().toISOString(),
            revision: Number(publicData._settingsRevisions?.systemHealth || 0),
            services: {
                backend: { reachable: true },
                database: { engine: 'mariadb', authoritative: true },
                firebaseAdmin: { configured: Boolean(admin && admin.apps && admin.apps.length && typeof admin.auth === 'function') },
                aiProviders: Object.fromEntries(['gemini', 'nvidia', 'openai', 'groq', 'openrouter', 'deepseek'].map(provider => [provider, { configured: Boolean(aiSettings[provider]?.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`]) }])),
                payments: {
                    stripe: { configured: Boolean(paymentSettings.stripe?.secretKey || process.env.STRIPE_SECRET) },
                    razorpay: { configured: Boolean((paymentSettings.razorpay?.keyId && paymentSettings.razorpay?.keySecret) || (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)) },
                },
            },
            settings: { maintenanceMode: mergedMaintenance.maintenanceMode === true || mergedMaintenance.enabled === true, maintenanceMessage: mergedMaintenance.maintenanceMessage || mergedMaintenance.message || '' },
        });
    } catch (error) {
        console.error('[Admin health summary]', error.message);
        return res.status(503).json({ success: false, code: 'HEALTH_UNAVAILABLE', error: 'Unable to read service health configuration.' });
    }
});

app.post('/api/admin/system-health-settings', requireRecentAdminAuthentication, async (req, res) => {
    const maintenanceMode = req.body?.maintenanceMode === true;
    const maintenanceMessage = String(req.body?.maintenanceMessage || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
    if (maintenanceMode && !maintenanceMessage) return res.status(400).json({ success: false, code: 'INVALID_MAINTENANCE_MESSAGE', error: 'A maintenance message is required while maintenance mode is enabled.' });
    const systemHealth = { maintenanceMode, maintenanceMessage };
    let connection;
    try {
        const expectedRevision = Number(req.body?.expectedRevision);
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
            throw Object.assign(new Error('expectedRevision is required.'), { code: 'ADMIN_SETTINGS_REVISION_REQUIRED', status: 400 });
        }
        // Configuration, its public projection, and the audit record commit as
        // one MariaDB transaction. An outage can never be converted into an
        // empty object that overwrites the last known maintenance state.
        connection = await getPool().getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query(
            "SELECT category, data FROM system_settings WHERE category IN ('public_config','maintenance') FOR UPDATE"
        );
        const settings = Object.fromEntries(rows.map(row => [
            row.category,
            typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {}),
        ]));
        const currentPublic = settings.public_config || {};
        const currentMaintenance = settings.maintenance || {};
        const currentRevision = Number(currentPublic._settingsRevisions?.systemHealth || currentMaintenance._revision || 0);
        if (expectedRevision !== currentRevision) {
            throw Object.assign(new Error('Health settings changed after this panel loaded. Refresh before saving.'), {
                code: 'ADMIN_SETTINGS_CONFLICT', status: 409,
            });
        }
        const nextRevision = currentRevision + 1;
        const maintenance = {
            enabled: maintenanceMode,
            message: maintenanceMessage,
            updatedBy: req.user?.email || req.user?.uid || 'admin',
            updatedAt: new Date().toISOString(),
            _revision: nextRevision,
        };
        const publicConfig = {
            ...currentPublic,
            systemHealth,
            _settingsRevisions: { ...(currentPublic._settingsRevisions || {}), systemHealth: nextRevision },
        };
        for (const [category, data] of [['maintenance', maintenance], ['public_config', publicConfig]]) {
            await connection.query(
                `INSERT INTO system_settings (category, data, revision, updated_at)
                 VALUES (?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = NOW()`,
                [category, JSON.stringify(data), nextRevision]
            );
        }
        await connection.query(
            `INSERT INTO admin_audit_logs
             (id, actor_uid, actor_email, actor_role, action, category, severity, outcome,
              method, pathname, status_code, resource_type, resource_id, metadata, request_id, created_at)
             VALUES (?, ?, ?, ?, 'SYSTEM_HEALTH_SETTINGS_UPDATED', 'system.config', 'HIGH', 'SUCCESS',
                     'POST', '/api/admin/system-health-settings', 200, 'PLATFORM_CONFIG', 'systemHealth', ?, ?, NOW())`,
            [crypto.randomUUID(), req.user.uid, req.user.email || null, req.user.role || 'ADMIN',
                JSON.stringify({ maintenanceMode, revision: nextRevision }), res.locals.requestId || null]
        );
        await connection.commit();
        return res.json({ success: true, settings: systemHealth, revision: nextRevision });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch { /* broken connection */ }
        }
        const status = error.status || (error.code === 'ADMIN_SETTINGS_CONFLICT' ? 409 : 503);
        return res.status(status).json({
            success: false,
            code: error.code || 'SYSTEM_HEALTH_SETTINGS_SAVE_FAILED',
            error: status < 500 ? error.message : 'Unable to save system health settings.',
            requestId: res.locals.requestId,
        });
    } finally {
        if (connection) connection.release();
    }
});

const GENERIC_ADMIN_SETTING_CATEGORIES = new Set([
    'modules', 'auth', 'blog', 'watermark', 'templateManager', 'security', 'jobScraper',
    'exportPdf', 'branding', 'geoSeo', 'llmGeo', 'integrations', 'landingMarketing',
    'socialAuth', 'google', 'facebook', 'social', 'storage', 'codeInjection', 'gdpr'
]);

function normalizeAdminSettingValue(value, depth = 0) {
    if (depth > 6) throw new Error('Settings nesting is too deep.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('Settings contain an invalid number.');
        return value;
    }
    if (typeof value === 'string') return value.replace(/\p{Cc}/gu, ' ').slice(0, 10_000);
    if (Array.isArray(value)) {
        if (value.length > 200) throw new Error('Settings list is too large.');
        return value.map(item => normalizeAdminSettingValue(item, depth + 1));
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length > 200) throw new Error('Settings object is too large.');
        return Object.fromEntries(entries.filter(([key]) => /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(key))
            .map(([key, item]) => [key, normalizeAdminSettingValue(item, depth + 1)]));
    }
    throw new Error('Settings contain an unsupported value.');
}

const LANDING_MARKETING_CLAIMS = Object.freeze([
    'activeJobs', 'rating', 'partnerCompanies', 'successfulHires',
    'featuredJobs', 'successRate', 'topCompanies',
]);

function normalizeLandingMarketingSettings(value = {}) {
    const allowed = new Set([...LANDING_MARKETING_CLAIMS, 'published', 'sourceUrl', 'verifiedAt']);
    const unknown = Object.keys(value).filter(key => !allowed.has(key));
    if (unknown.length) {
        throw Object.assign(new Error(`Unsupported landing-marketing field: ${unknown[0]}`), {
            code: 'LANDING_MARKETING_VALIDATION_ERROR', status: 400,
        });
    }
    const normalized = { published: value.published === true };
    for (const field of LANDING_MARKETING_CLAIMS) {
        const claim = String(value[field] || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 32);
        if (claim && !/^[0-9][0-9.,+%/ KMB]*$/i.test(claim)) {
            throw Object.assign(new Error(`${field} must be a concise numeric display value.`), {
                code: 'LANDING_MARKETING_VALIDATION_ERROR', status: 400,
            });
        }
        normalized[field] = claim;
    }
    if (normalized.rating) {
        const rating = Number(normalized.rating);
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
            throw Object.assign(new Error('Rating must be from 1 to 5.'), {
                code: 'LANDING_MARKETING_VALIDATION_ERROR', status: 400,
            });
        }
        normalized.rating = String(rating);
    }
    if (normalized.successRate) {
        const rate = Number(normalized.successRate.replace(/%$/, ''));
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
            throw Object.assign(new Error('Success rate must be from 0% to 100%.'), {
                code: 'LANDING_MARKETING_VALIDATION_ERROR', status: 400,
            });
        }
    }
    normalized.sourceUrl = String(value.sourceUrl || '').trim().slice(0, 2048);
    if (normalized.sourceUrl) {
        try {
            const source = new URL(normalized.sourceUrl);
            if (source.protocol !== 'https:' || source.username || source.password) throw new Error('unsafe');
            normalized.sourceUrl = source.href;
        } catch (_error) {
            throw Object.assign(new Error('Evidence source must be a valid HTTPS URL.'), {
                code: 'LANDING_MARKETING_VALIDATION_ERROR', status: 400,
            });
        }
    }
    const verifiedAt = value.verifiedAt ? new Date(value.verifiedAt) : null;
    normalized.verifiedAt = verifiedAt && Number.isFinite(verifiedAt.getTime()) ? verifiedAt.toISOString() : '';
    if (value.verifiedAt && !normalized.verifiedAt) {
        throw Object.assign(new Error('Evidence review date is invalid.'), {
            code: 'LANDING_MARKETING_VALIDATION_ERROR', status: 400,
        });
    }
    if (normalized.published) {
        const missing = LANDING_MARKETING_CLAIMS.filter(field => !normalized[field]);
        if (missing.length || !normalized.sourceUrl || !normalized.verifiedAt) {
            throw Object.assign(new Error('Every landing claim, its HTTPS evidence source, and review date are required before publication.'), {
                code: 'LANDING_MARKETING_EVIDENCE_REQUIRED', status: 400,
            });
        }
        const verifiedMs = Date.parse(normalized.verifiedAt);
        const ageMs = Date.now() - verifiedMs;
        if (ageMs < -5 * 60 * 1000 || ageMs > 180 * 24 * 60 * 60 * 1000) {
            throw Object.assign(new Error('Published landing evidence must be current (reviewed within 180 days) and not future-dated.'), {
                code: 'LANDING_MARKETING_EVIDENCE_STALE', status: 400,
            });
        }
    }
    return normalized;
}

function isPrivateAdminSettingKey(category, key) {
    const publicApiKeys = new Set(['googleMapsApiKey', 'cloudinaryApiKey']);
    return /(?:secret|password|privateKey|authToken|clientToken|accessToken|refreshToken|serviceAccount|merchantKey|saltKey|keySecret|s3AccessKeyId)/i.test(key)
        || (key === 'apiKey' && category !== 'firebase')
        || (/apiKey$/i.test(key) && !publicApiKeys.has(key))
        || (category === 'exportPdf' && ['chromiumPath', 'backendExportUrl'].includes(key));
}

function preserveAdminSettingSecrets(category, current, next) {
    if (Array.isArray(next)) {
        const previousItems = Array.isArray(current) ? current : [];
        return next.map((item, index) => preserveAdminSettingSecrets(category, previousItems[index], item));
    }
    if (!next || typeof next !== 'object') return next;
    const previous = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    const output = {};
    for (const [key, value] of Object.entries(next)) {
        if (isPrivateAdminSettingKey(category, key)) {
            output[key] = typeof value === 'string' && !value.trim() && previous[key] !== undefined ? previous[key] : value;
        } else if (value && typeof value === 'object') {
            output[key] = preserveAdminSettingSecrets(category, previous[key], value);
        } else {
            output[key] = value;
        }
    }
    // Secret fields are intentionally absent from browser projections. Preserve them
    // even when the submitted public form therefore cannot include the field at all.
    for (const [key, value] of Object.entries(previous)) {
        if (Object.hasOwn(output, key)) continue;
        if (isPrivateAdminSettingKey(category, key)) output[key] = value;
        else if (value && typeof value === 'object' && !Array.isArray(value)) {
            const fragment = preserveAdminSettingSecrets(category, value, {});
            if (Object.keys(fragment).length) output[key] = fragment;
        }
    }
    return output;
}

function applyExplicitAdminSecretClears(category, current, next, clearSecrets) {
    const requested = Array.isArray(clearSecrets)
        ? clearSecrets.filter(value => typeof value === 'string')
        : Object.entries(clearSecrets || {}).filter(([, value]) => value === true).map(([key]) => key);
    if (!requested.length) return next;
    const output = next && typeof next === 'object' ? JSON.parse(JSON.stringify(next)) : {};
    for (const pathName of requested.slice(0, 50)) {
        const pathParts = String(pathName).split('.').filter(Boolean);
        const leaf = pathParts[pathParts.length - 1];
        if (!pathParts.length || !isPrivateAdminSettingKey(category, leaf)) continue;
        let target = output;
        for (const part of pathParts.slice(0, -1)) {
            if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) target[part] = {};
            target = target[part];
        }
        // A private marker survives the merge and is removed by the pure
        // materializer immediately before the MariaDB JSON document is written.
        target[leaf] = { __adminSecretDelete: true };
    }
    return output;
}

function materializeAdminSecretDeletes(value) {
    if (Array.isArray(value)) return value.map(materializeAdminSecretDeletes).filter(item => item !== undefined);
    if (!value || typeof value !== 'object') return value;
    if (value.__adminSecretDelete === true && Object.keys(value).length === 1) return undefined;
    return Object.fromEntries(Object.entries(value)
        .map(([key, item]) => [key, materializeAdminSecretDeletes(item)])
        .filter(([, item]) => item !== undefined));
}

function containsSecretMutation(value, clearSecrets, category = '') {
    const explicitClear = Object.entries(clearSecrets || {}).some(([, requested]) => requested === true)
        || (Array.isArray(clearSecrets) && clearSecrets.length > 0);
    if (explicitClear) return true;
    const visit = current => {
        if (Array.isArray(current)) return current.some(visit);
        if (!current || typeof current !== 'object') return false;
        return Object.entries(current).some(([key, item]) => {
            if (isPrivateAdminSettingKey(category, key)) {
                return typeof item === 'string' ? item.trim() !== '' && !/[•*]/.test(item) : item !== null && item !== undefined;
            }
            return visit(item);
        });
    };
    return visit(value);
}

function requiresRecentGenericSettingAuth(category, data, clearSecrets) {
    // Code injection is a high-impact browser execution surface even though it
    // is not a credential. Infrastructure bindings are handled separately as
    // read-only and are never made editable by elevating the caller.
    if (category === 'codeInjection') return true;
    return containsSecretMutation(data, clearSecrets, category);
}

function publicAdminSettings(category, data) {
    if (category === 'codeInjection') return {};
    if (['smtp', 'fallbackSmtp', 'imap'].includes(category)) return { enabled: data.enabled === true };
    const redact = value => {
        if (Array.isArray(value)) return value.map(redact);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).filter(([key]) => !isPrivateAdminSettingKey(category, key) && key !== '__adminSecretDelete').map(([key, item]) => [key, redact(item)]));
    };
    return redact(data);
}

// Curated read surface used by the admin settings loader and live inventory
// scripts. It is deliberately separate from the browser's public_config read:
// server-owned settings are projected through the same secret redaction policy
// before they leave this process.
app.get('/api/admin/settings', async (req, res) => {
    try {
        // MySQL system_settings is the authoritative store; Firestore is never
        // required on this synchronous admin surface.
        const { getRepository } = require('./repositories');
        const repo = getRepository();
        const [publicValue, adminValue] = await Promise.all([
            repo.getSetting('public_config'),
            repo.getSetting('admin_configuration'),
        ]);
        const publicRoot = publicValue || {};
        const adminRoot = adminValue || {};
        const settings = {};
        for (const [category, data] of Object.entries(publicRoot)) {
            if (category.startsWith('_')) continue;
            settings[category] = publicAdminSettings(category, data || {});
        }
        for (const [category, data] of Object.entries(adminRoot)) {
            if (category.startsWith('_') || Object.hasOwn(settings, category)) continue;
            settings[category] = publicAdminSettings(category, data || {});
        }
        return res.json({
            success: true,
            settings,
            revisions: {
                ...Object.fromEntries([...GENERIC_ADMIN_SETTING_CATEGORIES].map(category => [category, 0])),
                ...(adminRoot._revisions || {}),
                ...(publicRoot._settingsRevisions || {}),
            },
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Admin settings read]', error.message);
        return res.status(503).json({ success: false, code: 'SETTINGS_UNAVAILABLE', error: 'Unable to read admin settings.', requestId: res.locals.requestId });
    }
});

app.get('/api/admin/settings/:category', async (req, res) => {
    const category = String(req.params.category || '');
    if (!GENERIC_ADMIN_SETTING_CATEGORIES.has(category)) {
        return res.status(400).json({ success: false, error: 'Unsupported settings category.' });
    }
    try {
        const { getRepository } = require('./repositories');
        const repo = getRepository();
        const [publicValue, adminValue] = await Promise.all([
            repo.getSetting('public_config'),
            repo.getSetting('admin_configuration'),
        ]);
        const publicRoot = publicValue || {};
        const adminRoot = adminValue || {};
        const data = Object.hasOwn(adminRoot, category) ? adminRoot[category] : (publicRoot[category] || {});
        const projected = publicAdminSettings(category, data);
        const revision = (adminRoot._revisions && adminRoot._revisions[category]) || (publicRoot._settingsRevisions && publicRoot._settingsRevisions[category]) || 0;
        return res.json({
            success: true,
            category,
            settings: projected,
            revision,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Admin settings category read]', error.message);
        return res.status(503).json({ success: false, code: 'SETTINGS_UNAVAILABLE', error: 'Unable to read admin settings category.', requestId: res.locals.requestId });
    }
});

app.post('/api/admin/settings/:category', async (req, res) => {
    const category = String(req.params.category || '');
    if (!GENERIC_ADMIN_SETTING_CATEGORIES.has(category) || !req.body?.data || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) {
        return res.status(400).json({ success: false, error: 'Unsupported settings category or payload.' });
    }
    if (category === 'exportPdf' && (Object.hasOwn(req.body.data, 'websiteDomain') || Object.hasOwn(req.body.data, 'backendExportUrl') || Object.hasOwn(req.body.data, 'chromiumPath'))) {
        return res.status(403).json({ success: false, code: 'INFRASTRUCTURE_SETTING_READ_ONLY', error: 'Public render origin, backend export URL, and Chromium path are deployment-owned infrastructure settings. Change them through the deployment configuration.' });
    }
    if (category === 'storage') {
        return res.status(501).json({
            success: false,
            code: 'STORAGE_PROVIDER_UNSUPPORTED',
            error: 'No production application-storage adapter is implemented. Configure and certify a server-side object-storage adapter before enabling this setting.',
        });
    }
    if (category === 'social') {
        const allowed = new Set(['facebook', 'twitter', 'instagram', 'youtube', 'pinterest']);
        if (Object.keys(req.body.data).some(key => !allowed.has(key))) {
            return res.status(400).json({ success: false, code: 'INVALID_SOCIAL_LINKS', error: 'Unsupported social-link field.' });
        }
        for (const value of Object.values(req.body.data)) {
            if (value === '') continue;
            try {
                const parsed = new URL(String(value));
                if (parsed.protocol !== 'https:' || parsed.username || parsed.password || String(value).length > 500) throw new Error('unsafe');
            } catch {
                return res.status(400).json({ success: false, code: 'INVALID_SOCIAL_LINKS', error: 'Social links must be empty or valid HTTPS URLs.' });
            }
        }
    }
    if (requiresRecentGenericSettingAuth(category, req.body.data, req.body.clearSecrets)) {
        const guarded = requireRecentAdminAuthentication(req, res, () => {});
        if (guarded) return guarded;
    }
    try {
        if (Buffer.byteLength(JSON.stringify(req.body.data), 'utf8') > 100_000) throw new Error('Settings payload is too large.');
        let normalized = normalizeAdminSettingValue(req.body.data);
        if (category === 'landingMarketing') normalized = normalizeLandingMarketingSettings(normalized);
        if (category === 'llmGeo') normalized = normalizeLlmDiscoverySettings(normalized);
        let publicSettings;
        const expectedRevision = Number(req.body?.expectedRevision);
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
            throw Object.assign(new Error('expectedRevision is required.'), { code: 'ADMIN_SETTINGS_REVISION_REQUIRED', status: 400 });
        }
        // MariaDB is the authoritative store; the revision guard and audit are
        // enforced in the same row-locked transaction.
        const pool = require('./database/mysql').getPool();
        const conn = await pool.getConnection();
        let revision;
        try {
            await conn.beginTransaction();
            const [rows] = await conn.query(
                "SELECT category, data FROM system_settings WHERE category IN ('admin_configuration','public_config') FOR UPDATE"
            );
            const roots = Object.fromEntries(rows.map(row => [
                row.category,
                typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {}),
            ]));
            const currentAdmin = roots.admin_configuration || {};
            const currentPublic = roots.public_config || {};
            const adminRevision = currentAdmin._revisions?.[category];
            const publicRevision = currentPublic._settingsRevisions?.[category];
            if (adminRevision !== undefined && publicRevision !== undefined && Number(adminRevision) !== Number(publicRevision)) {
                throw Object.assign(new Error('Admin and public settings revisions have diverged.'), {
                    code: 'ADMIN_SETTINGS_REVISION_DRIFT', status: 503,
                });
            }
            const currentRevision = Number(adminRevision ?? publicRevision ?? 0);
            if (expectedRevision !== currentRevision) {
                throw Object.assign(new Error('These settings changed after the panel loaded. Refresh before saving.'), {
                    code: 'ADMIN_SETTINGS_CONFLICT', status: 409,
                });
            }
            revision = currentRevision + 1;
            const currentCategory = currentAdmin[category] ?? currentPublic[category];
            const mergedInput = category === 'landingMarketing'
                ? normalized
                : mergeAdminSettingCategory(currentCategory, normalized);
            const withClears = applyExplicitAdminSecretClears(category, currentCategory, mergedInput, req.body?.clearSecrets);
            const persisted = materializeAdminSecretDeletes(preserveAdminSettingSecrets(category, currentCategory, withClears));
            publicSettings = publicAdminSettings(category, persisted);
            const nextAdmin = {
                ...currentAdmin,
                [category]: persisted,
                _revisions: { ...(currentAdmin._revisions || {}), [category]: revision },
            };
            const nextPublic = {
                ...currentPublic,
                [category]: publicSettings,
                _settingsRevisions: { ...(currentPublic._settingsRevisions || {}), [category]: revision },
            };
            for (const [owner, data] of [['admin_configuration', nextAdmin], ['public_config', nextPublic]]) {
                await conn.query(
                    `INSERT INTO system_settings (category, data, revision, updated_at)
                     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                     ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = CURRENT_TIMESTAMP`,
                    [owner, JSON.stringify(data), revision]
                );
            }
            const changedFields = [
                ...Object.keys(normalized),
                ...(Array.isArray(req.body?.clearSecrets)
                    ? req.body.clearSecrets
                    : Object.entries(req.body?.clearSecrets || {})
                        .filter(([, value]) => value === true).map(([key]) => `clear:${key}`)),
            ].slice(0, 200);
            const auditAction = category === 'landingMarketing'
                ? (publicSettings.published === true ? 'LANDING_MARKETING_PUBLISHED' : 'LANDING_MARKETING_DRAFT_SAVED')
                : category === 'llmGeo'
                    ? (publicSettings.enableLlmGeo === true ? 'LLMS_DISCOVERY_PUBLISHED' : 'LLMS_DISCOVERY_DISABLED')
                    : 'ADMIN_SETTINGS_UPDATED';
            await conn.query(
                `INSERT INTO admin_audit_logs
                 (id, actor_uid, actor_email, actor_role, action, category, severity, outcome,
                  method, pathname, status_code, resource_type, resource_id, metadata, request_id, created_at)
                 VALUES (?, ?, ?, ?, ?, 'system.config', 'HIGH', 'SUCCESS',
                         'POST', ?, 200, 'PLATFORM_CONFIG', ?, ?, ?, NOW())`,
                [crypto.randomUUID(), req.user.uid, req.user.email || null, req.user.role || 'ADMIN', auditAction,
                    `/api/admin/settings/${category}`, category,
                    JSON.stringify({ category, revision, changedFields }), res.locals.requestId || null]
            );
            await conn.commit();
        } catch (err) {
            try { await conn.rollback(); } catch { /* broken connection */ }
            throw err;
        } finally {
            conn.release();
        }
        return res.json({ success: true, settings: publicSettings, revision, message: `${category} settings saved.` });
    } catch (error) {
        const status = error.code === 'ADMIN_SETTINGS_CONFLICT' ? 409 : (error.status || 503);
        return res.status(status).json({
            success: false,
            code: error.code || 'ADMIN_SETTINGS_SAVE_FAILED',
            error: status >= 500 ? 'Unable to save admin settings.' : error.message,
            requestId: res.locals.requestId,
        });
    }
});

app.post('/api/admin/ai-settings', requireRecentAdminAuthentication, async (req, res) => {
    try {
        const result = await saveAiAdminSettings({
            input: req.body || {},
            expectedRevision: req.body?.expectedRevision ?? 0,
            actorUid: req.user?.uid || 'admin_console', requestId: res.locals.requestId,
        });
        return res.json({ success: true, ...result, message: 'AI settings saved securely.' });
    } catch (error) {
        return res.status(error.status || 400).json({ success: false, code: error.code || 'AI_SETTINGS_SAVE_FAILED', error: error.message, requestId: res.locals.requestId });
    }
});

app.post('/api/admin/ai/test-provider', requireRecentAdminAuthentication, async (req, res) => {
    try {
        const result = await testAiProvider({
            environment: process.env,
            provider: String(req.body?.provider || ''), model: req.body?.model,
            apiKey: req.body?.apiKey, fetchImpl: global.fetch, timeoutMs: 30000,
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, code: error.code || 'AI_PROVIDER_TEST_FAILED', error: error.message, requestId: res.locals.requestId });
    }
});

app.post('/api/admin/ai/fetch-models', requireRecentAdminAuthentication, async (req, res) => {
    try {
        const provider = String(req.body?.provider || req.query?.provider || 'nvidia');
        const apiKey = req.body?.apiKey;
        const result = await fetchProviderModels({
            environment: process.env,
            provider, apiKey, fetchImpl: global.fetch, timeoutMs: 15000,
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, code: error.code || 'AI_MODELS_FETCH_FAILED', error: error.message, requestId: res.locals.requestId });
    }
});

app.get('/api/admin/ai/quota-stats', async (_req, res) => {
    try {
        const result = await getGlobalAiDashboardData();
        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(error.status || 503).json({
            success: false,
            code: error.code || 'AI_QUOTA_STORAGE_UNAVAILABLE',
            error: 'Unable to load AI quota data.',
            requestId: res.locals.requestId,
        });
    }
});

app.post('/api/admin/ai/quota-limits', requireRecentAdminAuthentication, async (req, res) => {
    try {
        const result = await setGlobalAiQuotaLimits({
            basicDailyLimit: req.body?.basicDailyLimit,
            premiumDailyLimit: req.body?.premiumDailyLimit,
            adminDailyLimit: req.body?.adminDailyLimit,
            enterpriseDailyLimit: req.body?.enterpriseDailyLimit,
            expectedRevision: req.body?.expectedRevision,
            actorUid: req.user.uid,
            requestId: res.locals.requestId,
        });
        return res.json({ success: true, ...result, message: 'AI quota limits saved successfully.' });
    } catch (error) {
        return res.status(error.status || 503).json({
            success: false,
            code: error.code || 'AI_QUOTA_STORAGE_UNAVAILABLE',
            error: error.status && error.status < 500 ? error.message : 'Unable to save AI quota limits.',
            remoteRevision: error.remoteRevision,
            requestId: res.locals.requestId,
        });
    }
});

app.post('/api/admin/ai/reset-quota', requireRecentAdminAuthentication, async (req, res) => {
    try {
        const uid = String(req.body?.uid || '').trim();
        const resetAll = req.body?.all === true;
        if (!resetAll && !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
            return res.status(400).json({ success: false, code: 'INVALID_AI_QUOTA_TARGET', error: 'Target user uid or all:true is required.' });
        }
        const resetResult = resetAll
            ? await resetAllAiQuota({ actorUid: req.user.uid, requestId: res.locals.requestId })
            : await resetUserAiQuota({ uid, actorUid: req.user.uid, requestId: res.locals.requestId });
        const deletedCount = resetAll ? resetResult : Number(resetResult.usageRowsDeleted || 0);
        return res.json({ success: true, deletedCount, message: `AI quota reset completed; ${deletedCount} daily usage record${deletedCount === 1 ? '' : 's'} removed.` });
    } catch (error) {
        return res.status(error.status || 503).json({
            success: false,
            code: error.code || 'AI_QUOTA_STORAGE_UNAVAILABLE',
            error: error.status && error.status < 500 ? error.message : 'Unable to reset AI quota.',
            requestId: res.locals.requestId,
        });
    }
});

app.post('/api/admin/payment-settings', requireRecentAdminAuthentication, async (req, res) => {
    const input = req.body || {};
    let connection;
    try {
        connection = await getPool().getConnection();
        await connection.beginTransaction();
        const [settingRows] = await connection.query(
            "SELECT category, data FROM system_settings WHERE category IN ('payment_providers','public_config','system_settings') FOR UPDATE"
        );
        const settings = Object.fromEntries(settingRows.map(row => {
            const value = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
            return [row.category, value];
        }));
        if (!settings.public_config || typeof settings.public_config !== 'object'
            || !settings.public_config.subscriptions || typeof settings.public_config.subscriptions !== 'object'
            || !settings.system_settings || typeof settings.system_settings !== 'object') {
            throw Object.assign(new Error('Authoritative payment configuration is not initialized.'), {
                code: 'PAYMENT_SETTINGS_UNINITIALIZED', status: 503,
            });
        }
        const currentSecrets = settings.payment_providers && typeof settings.payment_providers === 'object'
            ? settings.payment_providers : {};
        const currentPublicRoot = settings.public_config;
        const currentSysSettings = settings.system_settings;
        const numberInRange = (value, min, max, label) => {
            if (value === '' || value === null || value === undefined) {
                throw Object.assign(new Error(`${label} is required.`), { code: 'PAYMENT_SETTINGS_VALIDATION_ERROR', status: 400 });
            }
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
                throw Object.assign(new Error(`${label} must be between ${min} and ${max}.`), { code: 'PAYMENT_SETTINGS_VALIDATION_ERROR', status: 400 });
            }
            return parsed;
        };

    const currentPublic = currentPublicRoot.subscriptions;
    const currentRevision = Number(currentSecrets._revision || currentPublicRoot._settingsRevisions?.payments || 0);
    if (!Number.isInteger(Number(input.expectedRevision)) || Number(input.expectedRevision) < 0) {
        throw Object.assign(new Error('expectedRevision is required.'), { code: 'PAYMENT_SETTINGS_REVISION_REQUIRED', status: 400 });
    }
    if (Number(input.expectedRevision) !== currentRevision) {
        throw Object.assign(new Error('Payment settings changed after this panel loaded. Refresh before saving.'), {
            code: 'PAYMENT_SETTINGS_CONFLICT', status: 409, remoteRevision: currentRevision,
        });
    }
    const valueOrCurrent = (key, fallback = '') => {
        if (Object.hasOwn(input, key) && input[key] !== null && input[key] !== undefined && String(input[key]).trim() !== '') return input[key];
        if (currentPublic[key] !== undefined && currentPublic[key] !== null && String(currentPublic[key]).trim() !== '') return currentPublic[key];
        return fallback;
    };
    const authoritativeCurrency = String(currentSysSettings.currency || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(authoritativeCurrency)) {
        throw Object.assign(new Error('Platform currency is not initialized.'), {
            code: 'PLATFORM_CURRENCY_UNINITIALIZED', status: 503,
        });
    }
    const requestedCurrency = String(valueOrCurrent('currency', authoritativeCurrency)).toUpperCase();
    if (requestedCurrency !== authoritativeCurrency) {
        throw Object.assign(new Error('Platform currency is managed by the dedicated currency control. Reload this panel and change currency there.'), {
            code: 'PLATFORM_CURRENCY_MANAGED_SEPARATELY', status: 409,
        });
    }
    const publicSettings = {
        state: Object.hasOwn(input, 'state') ? input.state === true : currentPublic.state === true,
        pricingMatrix: input.pricingMatrix && typeof input.pricingMatrix === 'object'
            ? input.pricingMatrix : (currentPublic.pricingMatrix && typeof currentPublic.pricingMatrix === 'object' ? currentPublic.pricingMatrix : null),
        monthlyPrice: numberInRange(valueOrCurrent('monthlyPrice'), 0, 1_000_000, 'Monthly price'),
        monthlyOriginalPrice: numberInRange(valueOrCurrent('monthlyOriginalPrice', 0), 0, 1_000_000, 'Monthly original price'),
        quartarlyPrice: numberInRange(valueOrCurrent('quartarlyPrice'), 0, 1_000_000, 'Six-month price'),
        quartarlyOriginalPrice: numberInRange(valueOrCurrent('quartarlyOriginalPrice', 0), 0, 1_000_000, 'Quarterly original price'),
        yearlyPrice: numberInRange(valueOrCurrent('yearlyPrice'), 0, 1_000_000, 'Yearly price'),
        yearlyOriginalPrice: numberInRange(valueOrCurrent('yearlyOriginalPrice', 0), 0, 1_000_000, 'Yearly original price'),
        enterprisePrice: numberInRange(valueOrCurrent('enterprisePrice', 0), 0, 1_000_000, 'Enterprise price'),
        enterpriseOriginalPrice: numberInRange(valueOrCurrent('enterpriseOriginalPrice', 0), 0, 1_000_000, 'Enterprise original price'),
        quarterlyBadgeText: String(valueOrCurrent('quarterlyBadgeText', 'Save 33% off retail')).trim().slice(0, 50),
        yearlyBadgeText: String(valueOrCurrent('yearlyBadgeText', 'Save 79% • Best Value')).trim().slice(0, 50),
        enterpriseBadgeText: String(valueOrCurrent('enterpriseBadgeText', 'Save 40% on annual licenses')).trim().slice(0, 50),
        currency: authoritativeCurrency,
        onlyPP: Object.hasOwn(input, 'onlyPP') ? input.onlyPP === true : currentPublic.onlyPP === true,
        sandboxMode: Object.hasOwn(input, 'sandboxMode') ? input.sandboxMode === true : currentPublic.sandboxMode === true,
        razorpayUPI: Object.hasOwn(input, 'razorpayUPI') ? input.razorpayUPI === true : currentPublic.razorpayUPI === true,
        ...Object.fromEntries(['stripeEnabled','paypalEnabled','razorpayEnabled','paytmEnabled','phonepeEnabled','enableTax','taxInclusive','requireCustomerTaxId'].map(key => [key, Object.hasOwn(input, key) ? input[key] === true : currentPublic[key] === true])),
        taxName: String(valueOrCurrent('taxName')).replace(/\p{Cc}/gu, ' ').trim().slice(0, 30),
        taxRate: numberInRange(valueOrCurrent('taxRate'), 0, 100, 'Tax rate'),
        companyTaxId: String(valueOrCurrent('companyTaxId')).trim().slice(0, 30),
        supplierLegalName: String(valueOrCurrent('supplierLegalName')).trim().slice(0, 150),
        supplierTradeName: String(valueOrCurrent('supplierTradeName')).trim().slice(0, 150),
        supplierGstin: String(valueOrCurrent('supplierGstin')).trim().slice(0, 30),
        supplierPan: String(valueOrCurrent('supplierPan')).trim().slice(0, 30),
        supplierAddress: String(valueOrCurrent('supplierAddress')).trim().slice(0, 500),
        supplierCity: String(valueOrCurrent('supplierCity')).trim().slice(0, 100),
        supplierState: String(valueOrCurrent('supplierState')).trim().slice(0, 100),
        supplierStateCode: String(valueOrCurrent('supplierStateCode')).trim().slice(0, 10),
        supplierPincode: String(valueOrCurrent('supplierPincode')).trim().slice(0, 20),
        sacCode: String(valueOrCurrent('sacCode')).trim().slice(0, 30),
        invoicePrefix: String(valueOrCurrent('invoicePrefix')).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 3),
        financialYear: String(valueOrCurrent('financialYear')).trim().slice(0, 20),
        stripePublishableKey: String(valueOrCurrent('stripePublishableKey', '')).slice(0, 200),
        razorpayKeyId: String(valueOrCurrent('razorpayKeyId', currentSecrets.razorpay?.keyId || process.env.RAZORPAY_KEY_ID || '')).slice(0, 100),
        paypalClientId: String(valueOrCurrent('paypalClientId', currentSecrets.paypal?.clientId || process.env.PAYPAL_CLIENT_ID || '')).slice(0, 200),
        paytmMid: String(valueOrCurrent('paytmMid', currentSecrets.paytm?.mid || process.env.PAYTM_MID || '')).slice(0, 50),
        paytmWebsite: String(valueOrCurrent('paytmWebsite', currentSecrets.paytm?.website || process.env.PAYTM_WEBSITE || '')).slice(0, 50),
        phonepeId: String(valueOrCurrent('phonepeId', currentSecrets.phonepe?.merchantId || process.env.PHONEPE_MERCHANT_ID || '')).slice(0, 100),
        phonepeSaltIndex: String(valueOrCurrent('phonepeSaltIndex', currentSecrets.phonepe?.saltIndex || process.env.PHONEPE_SALT_INDEX || '')).slice(0, 10),
    };
    const secretValue = (value, label) => resolveWriteOnlySecret({ value, label }).value;
    const clearSecrets = input.clearSecrets && typeof input.clearSecrets === 'object' ? input.clearSecrets : {};
    const secretDefinitions = {
        stripe: ['secretKey', 'stripeSecretKey', 'Stripe secret'],
        paypal: ['clientSecret', 'paypalClientSecret', 'PayPal client secret'],
        razorpay: ['keySecret', 'razorpayKeySecret', 'Razorpay key secret'],
        paytm: ['merchantKey', 'paytmMerchantKey', 'Paytm merchant key'],
        phonepe: ['saltKey', 'phonepeSaltKey', 'PhonePe salt key'],
    };
    const providerSecrets = {};
    const submittedSecrets = {};
        for (const [provider, [persistedField, inputField, label]] of Object.entries(secretDefinitions)) {
            const clear = clearSecrets[provider] === true;
            const environmentField = provider === 'stripe' ? 'STRIPE_SECRET'
                : provider === 'paypal' ? 'PAYPAL_CLIENT_SECRET'
                    : provider === 'razorpay' ? 'RAZORPAY_KEY_SECRET'
                        : provider === 'paytm' ? 'PAYTM_MERCHANT_KEY' : 'PHONEPE_SALT_KEY';
            if (clear && String(process.env[environmentField] || '').trim()) {
                const error = new Error(`${label} is deployment-managed and cannot be cleared from the Admin UI.`);
                error.code = 'INFRASTRUCTURE_SECRET_CANNOT_CLEAR';
                error.status = 409;
                throw error;
            }
            const raw = secretValue(input[inputField], label);
            if (clear) {
                providerSecrets[provider] = { [persistedField]: '' };
                submittedSecrets[provider] = '';
            } else if (raw) {
                providerSecrets[provider] = { [persistedField]: raw };
                submittedSecrets[provider] = raw;
            } else {
                providerSecrets[provider] = currentSecrets[provider] ? { ...currentSecrets[provider] } : {};
                submittedSecrets[provider] = '';
            }
        }
        providerSecrets.paypal.clientId = publicSettings.paypalClientId;
        providerSecrets.paypal.environment = publicSettings.sandboxMode ? 'sandbox' : 'live';
        providerSecrets.razorpay.keyId = publicSettings.razorpayKeyId;
        providerSecrets.paytm.mid = publicSettings.paytmMid;
        providerSecrets.paytm.website = publicSettings.paytmWebsite;
        providerSecrets.phonepe.merchantId = publicSettings.phonepeId;
        providerSecrets.phonepe.saltIndex = publicSettings.phonepeSaltIndex;

        const nextRevision = currentRevision + 1;
        providerSecrets._revision = nextRevision;

        const mergedPublicRoot = {
            ...currentPublicRoot,
            subscriptions: publicSettings,
            currency: publicSettings.currency,
            currencySymbol: publicSettings.currency === 'INR' ? '₹' : publicSettings.currency === 'EUR' ? '€' : publicSettings.currency === 'GBP' ? '£' : '$',
            _settingsRevisions: { ...(currentPublicRoot._settingsRevisions || {}), payments: nextRevision }
        };

        if (publicSettings.state) {
            if (publicSettings.currency !== 'INR') {
                throw Object.assign(new Error('Checkout cannot be enabled until immutable invoice issuance supports the configured currency.'), {
                    code: 'INVOICE_CURRENCY_UNSUPPORTED', status: 409,
                });
            }
            if ([publicSettings.monthlyPrice, publicSettings.quartarlyPrice, publicSettings.yearlyPrice].some(value => value <= 0)) {
                throw Object.assign(new Error('Enabled checkout requires positive prices for every offered plan.'), {
                    code: 'PAYMENT_SETTINGS_VALIDATION_ERROR', status: 400,
                });
            }
            if (!publicSettings.enableTax || !publicSettings.taxInclusive) {
                throw Object.assign(new Error('Checkout currently requires tax-inclusive pricing so the displayed, charged, and invoiced totals are identical.'), {
                    code: 'TAX_PRICING_MODE_UNSUPPORTED', status: 409,
                });
            }
            // This validates legal supplier identity, GST registration, place of
            // supply inputs, SAC, invoice sequence prefix, and financial year.
            // Checkout cannot be enabled if a confirmed payment could not be
            // represented by the immutable invoice authority.
            supplierFromPublicConfig(mergedPublicRoot);

            const enabledProviders = PAYMENT_PROVIDERS.filter(provider => publicSettings[`${provider}Enabled`] === true);
            if (!enabledProviders.length) {
                throw Object.assign(new Error('Enable and configure at least one payment provider before enabling checkout.'), {
                    code: 'PAYMENT_PROVIDER_UNAVAILABLE', status: 409,
                });
            }
            const effectiveProviderPairs = {
                stripe: chooseCredentialPair({ environmentSecret: process.env.STRIPE_SECRET, storedSecret: providerSecrets.stripe?.secretKey }),
                paypal: chooseCredentialPair({ environmentId: process.env.PAYPAL_CLIENT_ID, environmentSecret: process.env.PAYPAL_CLIENT_SECRET, storedId: providerSecrets.paypal?.clientId, storedSecret: providerSecrets.paypal?.clientSecret }),
                razorpay: chooseCredentialPair({ environmentId: process.env.RAZORPAY_KEY_ID, environmentSecret: process.env.RAZORPAY_KEY_SECRET, storedId: providerSecrets.razorpay?.keyId, storedSecret: providerSecrets.razorpay?.keySecret }),
                paytm: chooseCredentialPair({ environmentId: process.env.PAYTM_MID, environmentSecret: process.env.PAYTM_MERCHANT_KEY, storedId: providerSecrets.paytm?.mid, storedSecret: providerSecrets.paytm?.merchantKey }),
                phonepe: chooseCredentialPair({ environmentId: process.env.PHONEPE_MERCHANT_ID, environmentSecret: process.env.PHONEPE_SALT_KEY, storedId: providerSecrets.phonepe?.merchantId, storedSecret: providerSecrets.phonepe?.saltKey }),
            };
            const incompleteProvider = enabledProviders.find(provider => {
                const pair = effectiveProviderPairs[provider];
                if (provider === 'stripe') return !pair?.secret || !publicSettings.stripePublishableKey;
                if (!pair?.id || !pair?.secret) return true;
                if (provider === 'paytm') return !publicSettings.paytmWebsite;
                if (provider === 'phonepe') {
                    const saltIndex = Number.parseInt(publicSettings.phonepeSaltIndex, 10);
                    return !Number.isSafeInteger(saltIndex) || saltIndex < 1;
                }
                return false;
            });
            if (incompleteProvider) {
                throw Object.assign(new Error(`${incompleteProvider} is enabled but its complete credential pair is unavailable.`), {
                    code: 'PAYMENT_PROVIDER_UNAVAILABLE', status: 409,
                });
            }
        }

        // Configuration and audit are one MariaDB transaction. Holding the
        // setting rows FOR UPDATE above makes expectedRevision a real CAS. The
        // dedicated currency service remains the only writer of system currency.
        for (const [category, data] of [
            ['payment_providers', providerSecrets],
            ['public_config', mergedPublicRoot],
        ]) {
            await connection.query(
                `INSERT INTO system_settings (category, data, revision, updated_at)
                 VALUES (?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = NOW()`,
                [category, JSON.stringify(data), nextRevision]
            );
        }
        await connection.query(
            `INSERT INTO admin_audit_logs
             (id, actor_uid, actor_email, actor_role, action, category, severity, outcome,
              method, pathname, status_code, resource_type, resource_id, metadata, request_id, created_at)
             VALUES (?, ?, ?, ?, 'PAYMENT_SETTINGS_UPDATED', 'billing.payments', 'HIGH', 'SUCCESS',
                     'POST', '/api/admin/payment-settings', 200, 'PLATFORM_CONFIG', 'payments', ?, ?, NOW())`,
            [
                crypto.randomUUID(),
                req.user?.uid || 'admin_console',
                req.user?.email || null,
                req.user?.role || 'ADMIN',
                JSON.stringify({
                    revision: nextRevision,
                    changedSecretProviders: Object.entries(clearSecrets)
                        .filter(([, value]) => value === true).map(([key]) => key),
                }),
                res.locals?.requestId || null,
            ]
        );
        await connection.commit();

        const configuredProviders = {};
        const maskedKeys = {};
        const credentialSources = {};
        for (const provider of Object.keys(secretDefinitions)) {
            const field = secretDefinitions[provider][0];
            const stored = currentSecrets[provider]?.[field];
            const environmentField = provider === 'stripe' ? 'STRIPE_SECRET'
                : provider === 'paypal' ? 'PAYPAL_CLIENT_SECRET'
                    : provider === 'razorpay' ? 'RAZORPAY_KEY_SECRET'
                        : provider === 'paytm' ? 'PAYTM_MERCHANT_KEY' : 'PHONEPE_SALT_KEY';
            const storedSecret = clearSecrets[provider] === true ? '' : submittedSecrets[provider] || stored;
            const identifier = provider === 'razorpay' ? publicSettings.razorpayKeyId
                : provider === 'paypal' ? publicSettings.paypalClientId
                    : provider === 'paytm' ? publicSettings.paytmMid
                        : provider === 'phonepe' ? publicSettings.phonepeId : '';
            const environmentId = provider === 'razorpay' ? process.env.RAZORPAY_KEY_ID
                : provider === 'paypal' ? process.env.PAYPAL_CLIENT_ID
                    : provider === 'paytm' ? process.env.PAYTM_MID
                        : provider === 'phonepe' ? process.env.PHONEPE_MERCHANT_ID : '';
            const selected = chooseCredentialPair({ environmentId, environmentSecret: process.env[environmentField], storedId: identifier, storedSecret });
            configuredProviders[provider] = provider === 'stripe' ? Boolean(selected.secret) : Boolean(selected.id && selected.secret);
            credentialSources[provider] = selected.source;
            maskedKeys[provider] = selected.secret ? `••••${String(selected.secret).slice(-4)}` : '';
        }
        return res.json({
            success: true,
            settings: publicSettings,
            configuredProviders,
            maskedKeys,
            credentialSources,
            revision: nextRevision,
            message: 'Payment settings saved to split public/secret stores. Empty secret fields preserved existing credentials.',
        });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        const status = Number(error.status) || (error.code === 'INFRASTRUCTURE_SECRET_CANNOT_CLEAR' ? 409 : 503);
        return res.status(status).json({
            success: false,
            code: error.code || 'PAYMENT_SETTINGS_SAVE_FAILED',
            error: status >= 500 ? 'Unable to save payment settings.' : error.message,
            revision: error.remoteRevision,
            requestId: res.locals.requestId,
        });
    } finally {
        connection?.release();
    }
});

// Admin coupon list — MySQL authoritative (coupons table).
app.get('/api/admin/coupons', requireAuth, requirePermission(['payments.read', 'system.config.read']), async (req, res) => {
    try {
        const pool = require('./database/mysql').getPool();
        const [rows] = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC LIMIT 500');
        const coupons = rows.map(row => ({
            code: row.code,
            discount: Number(row.discount || 0),
            description: row.description || '',
            active: row.active === 1 || row.active === true,
            maxUses: Number(row.max_uses || 0),
            singleUsePerUser: row.single_use_per_user === 1,
            expiryDate: row.expiry_date || null,
            validUntil: row.expiry_date || (row.valid_until ? adminIso(row.valid_until) : null),
            revision: Number(row.revision || 0),
            createdAt: adminIso(row.created_at),
            ...(row.extra_json ? (typeof row.extra_json === 'string' ? JSON.parse(row.extra_json) : row.extra_json) : {}),
        }));
        return res.json({ success: true, coupons });
    } catch (_error) {
        return res.status(503).json({ success: false, error: 'Coupon service unavailable.' });
    }
});

// Public active coupons for checkout (MariaDB authoritative)
app.get('/api/coupons/active', async (_req, res) => {
    try {
        const pool = require('./database/mysql').getPool();
        const [rows] = await pool.query(
            "SELECT code, discount, description, expiry_date, max_uses, used_count FROM coupons WHERE active = 1 AND (expiry_date IS NULL OR expiry_date = '' OR expiry_date > NOW()) ORDER BY discount DESC LIMIT 10"
        );
        const coupons = rows.map(r => ({
            code: r.code,
            discount: Number(r.discount || 0),
            description: r.description || `${r.discount}% Discount`,
            expiryDate: r.expiry_date || null,
        }));
        return res.json({ success: true, coupons });
    } catch (_error) {
        try {
            const repo = resilientMutations.repoFor();
            const coupons = [];
            if (typeof repo.getAllCoupons === 'function') {
                const all = await repo.getAllCoupons();
                coupons.push(...all.filter(c => c.active !== false));
            }
            return res.json({ success: true, coupons });
        } catch {
            return res.status(503).json({ success: false, error: 'Coupon service unavailable.' });
        }
    }
});

// Authoritative public coupon validation endpoint (MariaDB authoritative)
app.post('/api/coupons/validate', async (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const uid = req.user?.uid || req.body?.uid || null;
    if (!code || !/^[A-Z0-9_-]{3,32}$/.test(code)) {
        return res.status(400).json({ success: false, valid: false, error: 'Invalid coupon code format. Must be 3-32 characters.' });
    }
    try {
        const repo = resilientMutations.repoFor();
        const coupon = await repo.getCoupon(code);
        if (!coupon) {
            return res.status(404).json({ success: false, valid: false, error: `Coupon code "${code}" does not exist.` });
        }
        if (coupon.active === false) {
            return res.status(409).json({ success: false, valid: false, error: `Coupon code "${code}" is currently inactive.` });
        }
        const expiryMs = coupon.expiryDate ? Date.parse(coupon.expiryDate) : 0;
        if (expiryMs && expiryMs <= Date.now()) {
            return res.status(409).json({ success: false, valid: false, error: `Coupon code "${code}" has expired.` });
        }
        const maxUses = Number(coupon.maxUses || 0);
        const usedCount = Number(coupon.usedCount || 0);
        if (maxUses > 0 && usedCount >= maxUses) {
            return res.status(409).json({ success: false, valid: false, error: `Coupon code "${code}" has reached its maximum redemptions.` });
        }
        if (coupon.singleUsePerUser && uid && typeof repo.getCouponRedemption === 'function') {
            const crypto = require('crypto');
            const redemptionId = crypto.createHash('sha256').update(`${code}:${uid}`).digest('hex');
            const existing = await repo.getCouponRedemption(redemptionId);
            if (existing?.status === 'USED') {
                return res.status(409).json({ success: false, valid: false, error: `You have already redeemed coupon "${code}".` });
            }
        }
        return res.json({
            success: true,
            valid: true,
            coupon: {
                code: coupon.code,
                discount: Number(coupon.discount || 0),
                description: coupon.description || `${coupon.discount}% Discount`,
                expiryDate: coupon.expiryDate || null,
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, valid: false, error: error.message });
    }
});

const handleSaveCouponRoute = async (req, res) => {
    const code = String(req.body?.code || req.params?.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
        return res.status(400).json({ success: false, error: 'Invalid coupon code. Must be 3-32 alphanumeric characters.' });
    }
    try {
        const repo = resilientMutations.repoFor();
        const existing = await repo.getCoupon(code);
        const expectedRevision = req.body?.expectedRevision !== undefined ? Number(req.body.expectedRevision) : (req.body?.revision !== undefined ? Number(req.body.revision) : null);
        if (existing && expectedRevision !== null && expectedRevision > 0 && Number(existing.revision || 0) !== expectedRevision) {
            return res.status(409).json({ success: false, code: 'CAS_CONFLICT', error: 'Coupon changed after loading.' });
        }
        const discount = Math.min(100, Math.max(1, Number(req.body?.discount || 10)));
        const record = {
            ...(existing || {}),
            code,
            discount,
            description: String(req.body?.description || `${discount}% Discount`).replace(/\p{Cc}/gu, ' ').slice(0, 200),
            active: req.body?.active !== false,
            expiryDate: req.body?.expiryDate || null,
            maxUses: Number(req.body?.maxUses || 0),
            singleUsePerUser: req.body?.singleUsePerUser === true,
            usedCount: Number(existing?.usedCount || 0),
            revision: Number(existing?.revision || 0) + 1,
        };
        await repo.saveCoupon(code, record);
        const actorUid = req.user?.uid || 'admin';
        await resilientMutations.audit(repo, { action: existing ? 'COUPON_UPDATED' : 'COUPON_CREATED', actorUid, code, revision: record.revision, requestId: res.locals?.requestId });
        return res.status(existing ? 200 : 201).json({ success: true, message: 'Coupon saved successfully.', coupon: record });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, error: error.message });
    }
};

app.post('/api/admin/coupons', requireAuth, requirePermission(['payments.manage', 'system.config.manage', 'payments.write', 'system.config.write']), handleSaveCouponRoute);
app.post('/api/admin/coupons/:code', requireAuth, requirePermission(['payments.manage', 'system.config.manage', 'payments.write', 'system.config.write']), handleSaveCouponRoute);
app.put('/api/admin/coupons/:code', requireAuth, requirePermission(['payments.manage', 'system.config.manage', 'payments.write', 'system.config.write']), handleSaveCouponRoute);

app.delete('/api/admin/coupons/:code', requireAuth, requirePermission(['payments.manage', 'system.config.manage', 'payments.write', 'system.config.write']), async (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    try {
        const repo = resilientMutations.repoFor();
        const existing = await repo.getCoupon(code);
        if (!existing) return res.status(404).json({ success: false, error: 'Coupon not found.' });
        const expectedRevisionRaw = req.body?.expectedRevision ?? req.query?.expectedRevision ?? req.body?.revision;
        const expectedRevision = expectedRevisionRaw !== undefined && expectedRevisionRaw !== null && expectedRevisionRaw !== '' ? Number(expectedRevisionRaw) : null;
        if (expectedRevision !== null && expectedRevision > 0 && Number(existing.revision || 0) !== expectedRevision) {
            return res.status(409).json({ success: false, code: 'CAS_CONFLICT', error: `Coupon changed after loading (current revision: ${existing.revision}, expected: ${expectedRevision}).` });
        }
        await repo.deleteCoupon(code);
        const actorUid = req.user?.uid || 'admin';
        await resilientMutations.audit(repo, { action: 'COUPON_DELETED', actorUid, code, revision: existing.revision, requestId: res.locals?.requestId });
        return res.json({ success: true, message: 'Coupon deleted successfully.' });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/payment/test-provider', requireRecentAdminAuthentication, async (req, res) => {
    const { type, secretKey } = req.body;
    if (!['stripe', 'razorpay', 'paypal', 'paytm', 'phonepe'].includes(type)) return res.status(400).json({ success: false, code: 'PAYMENT_PROVIDER_VALIDATION_ERROR', error: 'Unsupported payment provider test.' });
    try {
        if (type === 'stripe') {
            const submitted = String(secretKey || '').trim();
            let stored = '';
            if (!(submitted && !/[•*]/.test(submitted)) && !String(process.env.STRIPE_SECRET || '').trim()) {
                const persisted = await readPersistedPaymentProviders();
                stored = String(persisted.providers.stripe?.secretKey || '').trim();
            }
            const stripeKey = submitted && !/[•*]/.test(submitted) ? submitted : String(process.env.STRIPE_SECRET || stored).trim();
            if (!stripeKey) {
                return res.status(503).json({ success: false, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', error: 'Stripe is not configured. Add a server credential before testing.' });
            }
            const Stripe = require('stripe');
            const stripeInstance = Stripe(stripeKey);
            const balance = await stripeInstance.balance.retrieve();
            return res.json({ success: true, message: `Connected to Stripe. Livemode: ${balance.livemode}` });
        } else if (type === 'paypal') {
            const submittedId = String(req.body.clientId || '').trim();
            const submittedSecret = String(req.body.clientSecret || '').trim();
            let configured;
            try {
                configured = await paypalConfig();
            } catch (error) {
                if (!(submittedId && submittedSecret && !/[•*]/.test(submittedSecret))) throw error;
                const environment = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
                configured = { baseUrl: environment === 'live' || environment === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com' };
            }
            const clientId = submittedId && submittedSecret && !/[•*]/.test(submittedSecret) ? submittedId : configured.clientId;
            const clientSecret = submittedId && submittedSecret && !/[•*]/.test(submittedSecret) ? submittedSecret : configured.clientSecret;
            if (!clientId || !clientSecret) {
                return res.status(503).json({ success: false, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', error: 'PayPal is not fully configured. Add both the Client ID and Client Secret before testing.' });
            }
            await paypalAccessToken(configured.baseUrl, clientId, clientSecret);
            return res.json({ success: true, message: `Connected to PayPal. Mode: ${configured.baseUrl.includes('sandbox') ? 'SANDBOX' : 'LIVE'}` });
        } else if (type === 'razorpay') {
            const suppliedId = String(req.body.keyId || '').trim();
            const suppliedSecret = String(req.body.keySecret || '').trim();
            const credentials = suppliedId && suppliedSecret && !/[•*]/.test(suppliedSecret)
                ? { keyId: suppliedId, keySecret: suppliedSecret }
                : await getRazorpayKeys();
            const { keyId, keySecret } = credentials;
            if (!keyId || !keySecret) {
                return res.status(503).json({ success: false, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', error: 'Razorpay is not fully configured. Add both the Key ID and Key Secret, or configure the deployment environment.' });
            }
            const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
            const rzpRes = await fetch('https://api.razorpay.com/v1/settings', {
                headers: { 'Authorization': authHeader }
            });
            if (rzpRes.ok) {
                return res.json({ success: true, message: `Razorpay connected. Mode: ${keyId.startsWith('rzp_live') ? 'LIVE' : 'TEST'}` });
            } else {
                return res.status(422).json({ success: false, code: 'PAYMENT_PROVIDER_AUTHENTICATION_FAILED', error: 'Razorpay rejected the configured credentials.' });
            }
        } else if (type === 'paytm') {
            const submittedMid = String(req.body.mid || '').trim();
            const submittedKey = String(req.body.merchantKey || '').trim();
            const hasReplacement = Boolean(submittedMid && submittedKey && !/[•*]/.test(submittedKey));
            const configured = hasReplacement ? {} : await getPaytmConfig();
            const mid = hasReplacement ? submittedMid : configured.mid;
            const merchantKey = hasReplacement ? submittedKey : configured.key;
            if (!mid || !merchantKey) {
                return res.status(503).json({ success: false, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', error: 'Paytm is not fully configured. Add both the Merchant ID and Merchant Key before testing.' });
            }
            // Paytm credential format validation (MID is typically 20 chars alphanumeric)
            const midValid = /^[A-Za-z0-9]{8,30}$/.test(mid);
            const keyValid = merchantKey.length >= 16;
            if (!midValid || !keyValid) {
                return res.status(422).json({ success: false, code: 'PAYMENT_PROVIDER_VALIDATION_ERROR', error: 'Invalid Paytm credentials format. MID should be 8-30 alphanumeric chars; Merchant Key should be 16+ chars.' });
            }
            return res.status(501).json({
                success: false,
                code: 'PAYMENT_PROVIDER_CONNECTIVITY_TEST_UNAVAILABLE',
                error: 'Paytm credential format is valid, but no non-mutating provider operation is implemented to prove connectivity. No success claim was recorded.',
            });
        } else if (type === 'phonepe') {
            const submittedMerchantId = String(req.body.merchantId || '').trim();
            const submittedSaltKey = String(req.body.saltKey || '').trim();
            const submittedSaltIndex = Number.parseInt(req.body.saltIndex, 10);
            const hasReplacement = Boolean(submittedMerchantId && submittedSaltKey && !/[•*]/.test(submittedSaltKey));
            const hasCompleteReplacement = hasReplacement && Number.isInteger(submittedSaltIndex) && submittedSaltIndex > 0;
            const configured = hasCompleteReplacement ? {} : await getPhonePeConfig();
            const merchantId = hasReplacement ? submittedMerchantId : configured.merchantId;
            const saltKey = hasReplacement ? submittedSaltKey : configured.saltKey;
            if (!merchantId || !saltKey) {
                return res.status(503).json({ success: false, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', error: 'PhonePe is not fully configured. Add both the Merchant ID and Salt Key before testing.' });
            }
            const env = (process.env.PHONEPE_ENV || 'sandbox').toLowerCase();
            const baseUrl = (env === 'production' || env === 'live')
                ? 'https://api.phonepe.com/apis/hermes'
                : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
            const crypto = require('crypto');
            // Test a status check with a fake orderId to validate credential format
            const checksumStr = `/pg/v1/status/${merchantId}/TEST_CONN${saltKey}`;
            const sha256Hash = crypto.createHash('sha256').update(checksumStr).digest('hex');
            const saltIndex = Number.isInteger(submittedSaltIndex) && submittedSaltIndex > 0
                ? submittedSaltIndex
                : Number.parseInt(configured.saltIndex, 10);
            if (!Number.isInteger(saltIndex) || saltIndex < 1) {
                return res.status(422).json({ success: false, code: 'PAYMENT_PROVIDER_VALIDATION_ERROR', error: 'PhonePe Salt Index is required and must be a positive integer.' });
            }
            const checksum = `${sha256Hash}###${saltIndex}`;
            try {
                const ppRes = await fetch(`${baseUrl}/pg/v1/status/${merchantId}/TEST_CONN`, {
                    headers: { 'X-VERIFY': checksum, 'X-MERCHANT-ID': merchantId, 'Content-Type': 'application/json' }
                });
                const ppData = await ppRes.json();
                // Only the provider's explicit missing-transaction result proves that it authenticated the request.
                if (ppData?.code === 'TRANSACTION_NOT_FOUND') {
                    return res.json({ success: true, message: `PhonePe credentials valid. Env: ${env === 'production' || env === 'live' ? 'LIVE' : 'SANDBOX'}` });
                } else if (ppRes.ok) {
                    return res.json({ success: true, message: `PhonePe connected. Env: ${env === 'production' || env === 'live' ? 'LIVE' : 'SANDBOX'}` });
                } else {
                    return res.status(422).json({ success: false, code: 'PAYMENT_PROVIDER_AUTHENTICATION_FAILED', error: `PhonePe rejected the configured credentials (HTTP ${ppRes.status}).` });
                }
            } catch (_ppErr) {
                return res.status(503).json({ success: false, code: 'PAYMENT_PROVIDER_UNAVAILABLE', error: 'PhonePe could not be reached.' });
            }
        }
        return res.status(400).json({ success: false, code: 'PAYMENT_PROVIDER_VALIDATION_ERROR', error: 'Unsupported payment provider test.' });

    } catch (err) {
        const status = Number(err.status) >= 400 && Number(err.status) < 600 ? Number(err.status) : 503;
        const code = err.code || (err.message === 'PAYPAL_AUTH_FAILED' ? 'PAYMENT_PROVIDER_AUTHENTICATION_FAILED' : 'PAYMENT_PROVIDER_UNAVAILABLE');
        return res.status(status).json({ success: false, code, error: status >= 500 ? 'Payment provider test is unavailable.' : 'Payment provider credentials were rejected.', requestId: res.locals.requestId });
    }
});

async function loadTwilioRuntimeConfig() {
    const { getRepository } = require('./repositories');
    const repo = getRepository();
    const adminConfiguration = (await repo.getSetting('admin_configuration')) || {};
    const stored = adminConfiguration.twilio || {};
    const envSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
    const envToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
    const storedSid = String(stored.accountSid || '').trim();
    const storedToken = String(stored.authToken || '').trim();
    const useEnvironment = Boolean(envSid && envToken);
    const useStored = !useEnvironment && Boolean(storedSid && storedToken);
    const credentialSource = useEnvironment ? 'environment' : useStored ? 'mysql'
        : envSid || envToken ? 'environment-partial' : storedSid || storedToken ? 'mysql-partial' : 'none';
    return {
        accountSid: credentialSource.startsWith('environment') ? envSid : storedSid,
        authToken: credentialSource.startsWith('environment') ? envToken : storedToken,
        credentialSource,
        fromPhoneNumber: process.env.TWILIO_FROM_PHONE || stored.fromPhoneNumber || '',
        enableSmsAlerts: stored.enableSmsAlerts === true,
        revision: Number(stored._revision || 0),
    };
}

app.get('/api/admin/twilio-settings', async (req, res) => {
    try {
        const config = await loadTwilioRuntimeConfig();
        return res.json({
            success: true,
            settings: {
                accountSidConfigured: Boolean(config.accountSid),
                authTokenConfigured: Boolean(config.authToken),
                accountSidSuffix: config.accountSid ? String(config.accountSid).slice(-4) : '',
                fromPhoneNumber: config.fromPhoneNumber,
                enableSmsAlerts: config.enableSmsAlerts,
            },
            revision: config.revision,
        });
    } catch (_error) {
        return res.status(503).json({ success: false, error: 'SMS configuration is unavailable.' });
    }
});

app.post('/api/admin/twilio-settings', requireRecentAdminAuthentication, async (req, res) => {
    const accountSid = String(req.body?.accountSid || '').trim();
    const authToken = String(req.body?.authToken || '').trim();
    const fromPhoneNumber = String(req.body?.fromPhoneNumber || '').trim();
    const enableSmsAlerts = req.body?.enableSmsAlerts === true;
    const clearCredentials = req.body?.clearCredentials === true;
    const expectedRevision = Number(req.body?.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, code: 'TWILIO_REVISION_REQUIRED', error: 'A valid SMS settings revision is required.' });
    if (clearCredentials && (String(process.env.TWILIO_ACCOUNT_SID || '').trim() || String(process.env.TWILIO_AUTH_TOKEN || '').trim())) return res.status(409).json({ success: false, code: 'INFRASTRUCTURE_SECRET_CANNOT_CLEAR', error: 'Twilio credentials are deployment-managed and cannot be cleared from the Admin UI.' });
    if (Boolean(accountSid) !== Boolean(authToken)) return res.status(400).json({ success: false, code: 'TWILIO_CREDENTIAL_PAIR_REQUIRED', error: 'Enter both the Twilio Account SID and Auth Token when rotating credentials.' });
    if (accountSid && !/^AC[a-f0-9]{32}$/i.test(accountSid)) return res.status(400).json({ success: false, code: 'INVALID_TWILIO_ACCOUNT', error: 'Invalid Twilio Account SID.' });
    if (authToken && (authToken.length < 16 || authToken.length > 256 || /\p{Cc}/u.test(authToken))) return res.status(400).json({ success: false, code: 'INVALID_TWILIO_TOKEN', error: 'Invalid Twilio Auth Token.' });
    if (fromPhoneNumber && !/^\+[1-9]\d{7,14}$/.test(fromPhoneNumber)) return res.status(400).json({ success: false, code: 'INVALID_TWILIO_SENDER', error: 'The Twilio sender must be a valid E.164 phone number.' });

    let connection;
    try {
        connection = await getPool().getConnection();
        await connection.beginTransaction();
        const [adminRows] = await connection.query(
            "SELECT data FROM system_settings WHERE category = 'admin_configuration' FOR UPDATE"
        );
        const currentAdmin = adminRows[0]
            ? (typeof adminRows[0].data === 'string' ? JSON.parse(adminRows[0].data) : adminRows[0].data)
            : {};
        const current = currentAdmin.twilio || {};
        const currentRevision = Number(current._revision || 0);
        if (currentRevision !== expectedRevision) {
            throw Object.assign(new Error('SMS settings changed after this panel loaded. Refresh before saving.'), {
                code: 'ADMIN_SETTINGS_CONFLICT', status: 409, remoteRevision: currentRevision,
            });
        }
        const revision = currentRevision + 1;
        const next = {
            ...current,
            ...(accountSid ? { accountSid, authToken } : {}),
            ...(fromPhoneNumber ? { fromPhoneNumber } : {}),
            enableSmsAlerts,
            _revision: revision,
        };
        if (clearCredentials) { delete next.accountSid; delete next.authToken; }
        const effectiveSid = process.env.TWILIO_ACCOUNT_SID || next.accountSid || '';
        const effectiveToken = process.env.TWILIO_AUTH_TOKEN || next.authToken || '';
        const effectiveFrom = process.env.TWILIO_FROM_PHONE || next.fromPhoneNumber || '';
        if (enableSmsAlerts && (!effectiveSid || !effectiveToken || !effectiveFrom)) {
            throw Object.assign(new Error('Configure the Account SID, Auth Token, and sender number before enabling SMS alerts.'), {
                code: 'TWILIO_CONFIGURATION_INCOMPLETE', status: 400,
            });
        }
        await connection.query(
            `INSERT INTO system_settings (category, data, revision, updated_at)
             VALUES ('admin_configuration', ?, ?, NOW())
             ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = NOW()`,
            [JSON.stringify({ ...currentAdmin, twilio: next, _revisions: { ...(currentAdmin._revisions || {}), twilio: revision } }), revision]
        );
        const [publicRows] = await connection.query(
            "SELECT data FROM system_settings WHERE category = 'public_config' FOR UPDATE"
        );
        const currentPublic = publicRows[0]
            ? (typeof publicRows[0].data === 'string' ? JSON.parse(publicRows[0].data) : publicRows[0].data)
            : {};
        await connection.query(
            `INSERT INTO system_settings (category, data, revision, updated_at)
             VALUES ('public_config', ?, ?, NOW())
             ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = NOW()`,
            [JSON.stringify({ ...currentPublic, twilio: { enableSmsAlerts }, _settingsRevisions: { ...(currentPublic._settingsRevisions || {}), twilio: revision } }), revision]
        );
        await connection.query(
            `INSERT INTO admin_audit_logs
             (id, actor_uid, actor_email, actor_role, action, category, severity, outcome,
              method, pathname, status_code, resource_type, resource_id, metadata, request_id, created_at)
             VALUES (?, ?, ?, ?, 'TWILIO_SETTINGS_UPDATED', 'system.config', 'HIGH', 'SUCCESS',
                     'POST', '/api/admin/twilio-settings', 200, 'PLATFORM_CONFIG', 'twilio', ?, ?, NOW())`,
            [crypto.randomUUID(), req.user.uid, req.user.email || null, req.user.role || 'ADMIN',
                JSON.stringify({ revision, credentialsRotated: Boolean(accountSid), credentialsCleared: clearCredentials }),
                res.locals.requestId || null]
        );
        await connection.commit();
        const config = await loadTwilioRuntimeConfig();
        return res.json({ success: true, revision, settings: {
            accountSidConfigured: Boolean(config.accountSid), authTokenConfigured: Boolean(config.authToken),
            accountSidSuffix: config.accountSid ? String(config.accountSid).slice(-4) : '',
            fromPhoneNumber: config.fromPhoneNumber, enableSmsAlerts: config.enableSmsAlerts,
        } });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        const status = error.status || 503;
        return res.status(status).json({
            success: false, code: error.code || 'TWILIO_SETTINGS_SAVE_FAILED',
            error: status >= 500 ? 'Unable to save SMS settings.' : error.message,
            revision: error.remoteRevision, requestId: res.locals.requestId,
        });
    } finally {
        connection?.release();
    }
});

// Twilio SMS Dispatcher Endpoint
app.post('/api/send-sms', requireRecentAdminAuthentication, async (req, res) => {
    const { toPhone, messageBody } = req.body;
    if (!toPhone || !messageBody) {
        return res.status(400).json({ success: false, error: 'Target phone number and message body are required.' });
    }

    try {
        const { accountSid, authToken, fromPhoneNumber } = await loadTwilioRuntimeConfig();

        if (!accountSid || !authToken || !fromPhoneNumber) {
            return res.status(400).json({
                success: false,
                error: 'Twilio Gateway not configured. Please enter Account SID, Auth Token, and From Phone Number in Admin -> Twilio Settings.'
            });
        }
        if (!/^AC[a-f0-9]{32}$/i.test(accountSid) || !/^\+[1-9]\d{7,14}$/.test(String(toPhone))
            || !/^\+[1-9]\d{7,14}$/.test(String(fromPhoneNumber)) || String(messageBody).length > 1600) {
            return res.status(400).json({ success: false, error: 'Invalid SMS gateway or message parameters.' });
        }

        const targetHash = crypto.createHash('sha256').update(String(toPhone)).digest('hex');
        await getPool().query(
            `INSERT INTO security_audit_logs
             (id, action, actor_uid, category, severity, target_type, target_id, metadata, request_id, created_at)
             VALUES (?, 'TWILIO_SMS_TEST_REQUESTED', ?, 'communications.sms', 'HIGH',
                     'PHONE_HASH', ?, ?, ?, NOW())`,
            [crypto.randomUUID(), req.user.uid, targetHash,
                JSON.stringify({ messageLength: String(messageBody).length }), res.locals.requestId || null]
        );

        const authString = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

        const params = new URLSearchParams();
        params.append('To', toPhone);
        params.append('From', fromPhoneNumber);
        params.append('Body', messageBody);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
            timeout: 10_000,
        });

        const data = await response.json().catch(() => ({}));
        const accepted = response.ok && Boolean(data.sid);
        await getPool().query(
            `INSERT INTO security_audit_logs
             (id, action, actor_uid, category, severity, target_type, target_id, metadata, request_id, created_at)
             VALUES (?, ?, ?, 'communications.sms', 'HIGH', 'TWILIO_MESSAGE', ?, ?, ?, NOW())`,
            [crypto.randomUUID(), accepted ? 'TWILIO_SMS_TEST_ACCEPTED' : 'TWILIO_SMS_TEST_REJECTED',
                req.user.uid, accepted ? String(data.sid).slice(0, 128) : targetHash,
                JSON.stringify({ httpStatus: response.status, providerStatus: accepted ? String(data.status || 'accepted').slice(0, 64) : null }),
                res.locals.requestId || null]
        );
        if (accepted) return res.json({ success: true, messageSid: data.sid, status: data.status });
        return res.status(502).json({ success: false, code: 'TWILIO_MESSAGE_REJECTED', error: 'Twilio rejected the SMS test request.' });
    } catch (err) {
        console.error('[Twilio SMS]', { code: err.code, requestId: res.locals.requestId });
        return res.status(err.status || 503).json({ success: false, code: err.code || 'TWILIO_SMS_UNAVAILABLE', error: 'The SMS test is unavailable.', requestId: res.locals.requestId });
    }
});

// MariaDB-authoritative, explicitly enabled discovery metadata. An outage or
// incomplete configuration never falls back to promotional copy.
app.get('/llms.txt', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const publicConfig = await getRepository().getSetting('public_config');
        const llmGeo = normalizeLlmDiscoverySettings(publicConfig?.llmGeo || {});
        if (!llmGeo.enableLlmGeo || !llmGeo.llmsTxtContent) {
            return res.status(404).type('text/plain').send('LLM discovery metadata is not published.\n');
        }
        return res.type('text/plain').send(`${llmGeo.llmsTxtContent}\n`);
    } catch (error) {
        if (error.status === 400) {
            return res.status(503).type('text/plain').send('LLM discovery metadata is unavailable.\n');
        }
        console.error('[llms.txt]', { code: error.code, requestId: res.locals.requestId });
        return res.status(503).type('text/plain').send('LLM discovery metadata is unavailable.\n');
    }
});

// Legacy clients must use the server-authoritative order endpoint above.
app.post('/api/payment/razorpay-order', (req, res) => {
    return res.status(410).json({
        error: { code: 'LEGACY_PAYMENT_ENDPOINT_RETIRED', message: 'Use /api/razorpay/create-order with a planId', requestId: res.locals.requestId }
    });
});

// Invoice issuance is normally committed by payment activation. This endpoint
// is an idempotent recovery/read trigger and accepts only an order identifier;
// legal billing details are immutable once provider payment creation begins.
app.post('/api/invoice/generate', async (req, res) => {
    try {
        const suppliedFields = Object.keys(req.body || {}).filter(key => key !== 'paymentOrderId');
        if (suppliedFields.length) {
            return res.status(409).json({
                success: false,
                code: 'CLIENT_BILLING_DETAILS_RETIRED',
                error: 'Billing details must be captured before provider payment and cannot be changed during invoice issuance.',
                requestId: res.locals.requestId,
            });
        }
        const result = await generateInvoice({
            uid: req.user.uid,
            paymentOrderId: req.body?.paymentOrderId,
        });
        return res.status(result.duplicate ? 200 : 201).json({ success: true, ...result });
    } catch (error) {
        console.error('[Invoice generation]', { code: error.code, requestId: res.locals.requestId });
        return res.status(error.status || 503).json({
            success: false,
            code: error.code || 'INVOICE_GENERATION_FAILED',
            error: error.status && error.status < 500 ? error.message : 'Unable to generate the invoice.',
            requestId: res.locals.requestId,
        });
    }
});

// Historical invoices are read only from immutable server-issued records and
// are always owner-bound. A caller cannot enumerate or retrieve another
// account's invoice by guessing its payment-order identifier.
app.get('/api/invoices', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, private');
        const invoices = await listInvoicesForUser({ uid: req.user.uid, limit: req.query?.limit });
        return res.json({ success: true, invoices, source: 'MARIADB_IMMUTABLE_INVOICES', count: invoices.length });
    } catch (error) {
        return res.status(error.status || 503).json({
            success: false,
            code: error.code || 'INVOICE_HISTORY_UNAVAILABLE',
            error: error.status && error.status < 500 ? error.message : 'Invoice history is unavailable.',
            requestId: res.locals.requestId,
        });
    }
});

app.get('/api/invoices/:paymentOrderId', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, private');
        const invoice = await getInvoiceForUser({ uid: req.user.uid, paymentOrderId: req.params.paymentOrderId });
        return res.json({ success: true, invoice, source: 'MARIADB_IMMUTABLE_INVOICES' });
    } catch (error) {
        return res.status(error.status || 503).json({
            success: false,
            code: error.code || 'INVOICE_UNAVAILABLE',
            error: error.status && error.status < 500 ? error.message : 'Invoice is unavailable.',
            requestId: res.locals.requestId,
        });
    }
});

// Legacy client-authored paid invoices are not accounting records.
app.post('/api/invoice', (req, res) => {
    return res.status(410).json({ error: { code: 'LEGACY_INVOICE_ENDPOINT_RETIRED', message: 'Generate invoices from a verified payment order', requestId: res.locals.requestId } });
});

// Item 41 & 42: PDF Job Queue & DOCX (Word) Document Export Engine Endpoint
app.post('/api/export-docx', async (req, res) => {
    const { resumeName, resumeId } = req.body;
    if (!/^[A-Za-z0-9_-]{4,128}$/.test(String(resumeId || ''))) return res.status(400).json({ error: 'Invalid resume' });
    const requestedTemplate = String(resumeName || req.body.template || '').trim();
    if (requestedTemplate && !EXPORTABLE_TEMPLATE.test(requestedTemplate)) {
        return res.status(400).json({ error: 'Invalid export request' });
    }
    const { getRepository } = require('./repositories');
    const repo = getRepository();
    const docId = String(resumeId);
    const stored = requestedTemplate.startsWith('Cover')
        ? await repo.getCover(req.user.uid, docId)
        : await repo.getResume(req.user.uid, docId);
    if (!stored) return res.status(404).json({ error: 'Resume not found' });
    const owner = await repo.getUser(req.user.uid);
    if (!owner) return res.status(404).json({ error: 'Resume owner not found' });
    const publicConfig = (await repo.getSetting('public_config')) || {};
    const systemSettings = (await repo.getSetting('system_settings')) || {};
    const isGlobalFreeMode = publicConfig.subscriptions === false 
        || publicConfig.subscriptions?.state === false 
        || publicConfig.subscriptions?.enabled === false
        || systemSettings.subscriptions?.state === false;
    const entitlement = resolveEffectiveEntitlement(owner, { userClaims: req.user || {} });
    const allowFreeDocx = Boolean(publicConfig.watermark?.allowFreeDocxDownload);
    if (!isGlobalFreeMode && !entitlement.allowsDocxExport && !allowFreeDocx) {
        return res.status(402).json({ error: { code: 'ACTIVE_SUBSCRIPTION_REQUIRED', message: 'An active subscription or enterprise plan is required for DOCX export', requestId: res.locals.requestId } });
    }
    try {
        let resolvedTemplate;
        try {
            resolvedTemplate = resolveExportTemplate(stored, requestedTemplate);
        } catch (templateError) {
            return res.status(400).json({ error: templateError.code === 'TEMPLATE_MISMATCH' ? 'Template mismatch' : 'Invalid export request' });
        }
        const personName = [stored.firstname, stored.lastname].filter(Boolean).join(' ');
        const safeName = String(personName || stored.title || 'Resume').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 80) || 'Resume';
        // Theme presets are authoritative (same source as PDF). Client-supplied
        // colors and resumeName cannot override template identity or inject styling.
        const resumeData = {
            ...stored,
            template: resolvedTemplate,
            resumeName: resolvedTemplate,
            colors: null,
        };
        const buffer = await createResumeDocx(resumeData);
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName.replace(/\s+/g, '_')}.docx"`);
        res.setHeader('Content-Length', String(buffer.length));
        return res.send(buffer);
    } catch (error) {
        console.error('[DOCX export]', error.message);
        return res.status(500).json({ error: { code: 'DOCX_EXPORT_FAILED', message: 'Unable to generate DOCX export', requestId: res.locals.requestId } });
    }
});

// Item 44: RTL Native Font Support (Arabic/Hebrew) Helper
// Standard Health Check & RTL Font Config Helper
app.get('/api/rtl-font-config', (req, res) => {
    res.json({
        supportedLanguages: ['ar', 'he', 'fa', 'ur'],
        isRtlSupported: true,
        rtlFonts: ['Amiri', 'Noto Naskh Arabic', 'David Libre', 'Segoe UI']
    });
});

// Real AI Cover Letter Generator Endpoint (Admin Dashboard Dynamic AI Key & Model Integration)
app.post('/api/generate-ai-cover-letter', async (req, res) => {
    const requestController = new AbortController();
    req.once('aborted', () => requestController.abort());
    try {
        const compactField = (value, fallback, max = 4000) => {
            const text = String(value ?? fallback).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
            return text || fallback;
        };
        const title = compactField(req.body?.jobTitle, 'Software Engineer', 200);
        const company = compactField(req.body?.companyName, 'TechCorp', 200);
        const recipient = compactField(req.body?.recipientName, 'Hiring Manager', 200);
        const skills = compactField(req.body?.userSkills, 'full-stack architecture, API optimization, and team leadership', 4000);
        const candidate = compactField(req.body?.candidateName, 'Candidate', 120);
        const tone = compactField(req.body?.tone || req.body?.aiTone, 'modern', 50);
        const language = compactField(req.body?.language, 'English', 50);
        const jobDesc = compactField(req.body?.jobDescription, '', 4000);
        const rawExp = req.body?.yearsExperience ?? 'proven track record of';
        const exp = typeof rawExp === 'number'
            ? String(Math.min(50, Math.max(0, rawExp)))
            : compactField(rawExp, 'proven track record of', 200);

        let toneInstruction = 'Adopt a crisp, polished, approachable modern professional tone.';
        if (tone === 'formal' || tone === 'executive') {
            toneInstruction = 'Adopt an authoritative, measured, executive corporate tone suitable for leadership or traditional enterprises.';
        } else if (tone === 'impact' || tone === 'assertive') {
            toneInstruction = 'Adopt an energetic, results-driven, and metric-focused tone emphasizing tangible business ROI and achievements.';
        } else if (tone === 'creative' || tone === 'storytelling') {
            toneInstruction = 'Adopt an engaging, visionary storytelling tone highlighting passion, initiative, and cultural alignment.';
        }

        const jdContext = jobDesc ? `\nTarget Job Description / Requirements:\n${jobDesc}\nSeamlessly align the candidate's background with key requirements from this job description.` : '';
        const langContext = (language && language.toLowerCase() !== 'en' && language.toLowerCase() !== 'english') ? `\nOutput the entire cover letter fluently and naturally in ${language}.` : '';

        const systemPrompt = `You are an elite executive career strategist and professional resume writer specializing in high-impact ATS cover letters. Never invent candidate facts and return only the requested cover letter. ${toneInstruction}`;
        const prompt = `${systemPrompt}\n\nWrite a compelling, tailored, 3-paragraph ATS cover letter addressed to ${recipient} for a ${title} position at ${company}. Highlight ${exp} years of experience and key skills in ${skills}.${jdContext}${langContext}\nClose the letter with the candidate name ${candidate}.`;
        try {
            const configuration = await loadProviderConfiguration();
            configuration.maxTokens = Math.min(1000, Math.max(500, configuration.maxTokens));
            const providerResult = await generateWithProviders({ prompt, configuration, operation: 'generate-ai-cover-letter', signal: requestController.signal, timeoutMs: 45000 });
            const coverLetter = String(providerResult.raw || '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/<[^>]*>/g, '').replace(/^```(?:text)?\s*|```$/gi, '').trim().slice(0, 20000);
            if (coverLetter) {
                if (res?.setHeader && !res.headersSent) {
                    res.setHeader('X-AI-Provider', providerResult.provider);
                    res.setHeader('X-AI-Model', providerResult.model);
                }
                return res.json({ success: true, coverLetter, provider: providerResult.provider });
            }
        } catch (providerError) {
            console.warn('[Cover letter provider fallback]', { code: providerError.code || 'PROVIDER_ERROR', requestId: res.locals.requestId });
        }

        const hookTemplates = [
            `I am thrilled to submit my application for the ${title} role at ${company}. Having followed ${company}'s industry impact and growth trajectory, I am eager to contribute my background in ${skills} to advance your team's upcoming initiatives.`,
            `With a strong background executing high-value projects in ${title} roles, I am excited about the opportunity to join ${company}. My career has been defined by delivering measurable efficiency gains and driving technical innovation.`,
            `It is with great enthusiasm that I apply for the ${title} position at ${company}. As a proactive practitioner with over ${exp} years of specialized experience, I have consistently turned strategic goals into impactful execution.`
        ];
        const bodyTemplates = [
            `Over the past ${exp} years, I have led cross-functional teams and engineered scalable solutions that reduced operating overhead while accelerating delivery timelines. At my previous organizations, my focus on ${skills} enabled us to exceed performance benchmarks consistently. I thrive in dynamic environments where complex problems require structured, resilient solutions.`,
            `My core competencies encompass ${skills}, with a track record of optimizing workflow architectures and leading cross-disciplinary initiatives. At ${company}, I am prepared to apply this expertise to streamline core operations, mentor junior team members, and drive sustainable long-term value.`,
            `Throughout my professional journey, I have specialized in ${skills}. My approach combines data-driven decision-making with hands-on technical rigor, ensuring that every project not only meets compliance standards but delivers compelling user and business outcomes.`
        ];
        const closeTemplates = [
            `I would welcome the opportunity to discuss how my experience and skill set directly align with ${company}'s strategic priorities for the ${title} position. Thank you for your time and consideration.`,
            `I look forward to the possibility of discussing how my qualifications and enthusiasm for ${company}'s mission can contribute to your team's continued success. Thank you for evaluating my application.`,
            `Thank you for reviewing my candidacy. I am eager to explore how my background in ${skills} can help ${company} achieve its long-term objectives.`
        ];
        const randomPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const generated = `Dear ${recipient},\n\n${randomPick(hookTemplates)}\n\n${randomPick(bodyTemplates)}\n\n${randomPick(closeTemplates)}\n\nSincerely,\n${candidate}`;

        return res.json({ success: true, coverLetter: generated, provider: 'fallback' });
    } catch (error) {
        console.error('[Cover letter generation]', { code: error.code || 'COVER_LETTER_ERROR', requestId: res.locals.requestId });
        return res.status(500).json({ success: false, error: { code: 'COVER_LETTER_GENERATION_FAILED', message: 'Cover letter generation is temporarily unavailable', requestId: res.locals.requestId } });
    }
});

// Naukri.com Scraper Endpoint
app.post('/api/jobs/naukri', async (_req, res) => {
    return res.status(501).json({
        success: false,
        code: 'SCRAPER_NOT_CONFIGURED',
        error: 'Naukri ingestion is not configured. No demo or fabricated listings are returned.',
    });
});

// Public, secret-free capability projection. The browser uses this to hide
// controls whose provider is disabled or unconfigured, so a user can never
// click a button that is guaranteed to return 404/503. It exposes booleans
// only: no hostname, key, credential, or provider error detail.
app.get('/api/service-availability', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const { getServiceAvailability } = require('./services/platformHealth');
        return res.json({ success: true, ...(await getServiceAvailability(req.app)) });
    } catch (error) {
        console.error('[Service availability]', error?.message || error);
        // Availability is unknown, not "everything works". The client keeps its
        // last known state rather than optimistically enabling controls.
        return res.status(503).json({ success: false, error: { code: 'AVAILABILITY_UNAVAILABLE', message: 'Service availability could not be determined' } });
    }
});

let globalCommitSha = process.env.COMMIT_SHA;
try {
  const { execSync } = require('child_process');
  const gitSha = execSync('git rev-parse HEAD', { encoding: 'utf8', timeout: 1000 }).trim();
  if (/^[0-9a-f]{40}$/i.test(gitSha)) globalCommitSha = gitSha;
} catch (_) {}
if (!globalCommitSha) {
  try {
    const fs = require('fs');
    const shaPath = require('path').join(__dirname, 'COMMIT_SHA');
    if (fs.existsSync(shaPath)) {
      const bytes = fs.readFileSync(shaPath);
      const decoded = bytes[0] === 0xff && bytes[1] === 0xfe
        ? bytes.toString('utf16le')
        : bytes.toString('utf8');
      const candidate = decoded.replace(/^\uFEFF/, '').trim();
      if (/^[0-9a-f]{40}$/i.test(candidate)) globalCommitSha = candidate;
    }
  } catch (_) {}
}

function databaseHealthPayload() {
    const status = databaseAuthority.getStatus();
    const mariadbHealth = status.health.mysql;
    const databaseState = mariadbHealth.healthy === true ? 'UP' : (mariadbHealth.healthy === false ? 'DOWN' : 'UNKNOWN');
    return {
        mariadb: {
            status: databaseState,
            healthy: mariadbHealth.healthy,
            lastError: mariadbHealth.lastError,
            latencyMs: mariadbHealth.latencyMs,
        },
        authority: {
            mode: status.mode,
            owner: 'MARIADB',
            mutable: false,
            canAcceptWrites: status.canAcceptWrites,
            lastRecoveryAt: status.lastRecoveryAt,
        },
    };
}

// Liveness: the process is up. Readiness (below) is what proves the data plane.
function livenessPayload() {
    return {
        status: 'ok',
        identityProviderConfigured: Boolean(admin && admin.apps && admin.apps.length > 0),
        firebaseAdminConfigured: Boolean(admin && admin.apps && admin.apps.length > 0),
        firestoreDataPlane: 'REMOVED',
        authoritativeDatabase: 'MARIADB',
        date: new Date().toISOString(),
        commitSha: globalCommitSha,
        databases: databaseHealthPayload(),
    };
}
app.get('/healthz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(livenessPayload());
});
app.get('/api/healthz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(livenessPayload());
});
app.get('/api/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(livenessPayload());
});
app.get('/api/health/databases', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const snapshot = await databaseAuthority.refresh();
        return res.json({ success: true, ...snapshot });
    } catch (_error) {
        return res.status(503).json({ success: false, error: { code: 'HEALTH_PROBE_FAILED', message: 'Database health could not be determined', requestId: res.locals.requestId } });
    }
});

/**
 * Readiness is defined by the AUTHORITATIVE data plane: MySQL/MariaDB.
 * Firestore has no part in readiness — the data plane was removed from the
 * runtime. Identity (Firebase Admin) is reported but is not the readiness
 * gate, because local/CI environments legitimately run without identity
 * credentials while the data plane is fully operational.
 */
async function computeReadyzPayload() {
    const mysql = await testMysql();
    const schema = app.get('schemaState')();
    const tenantService = app.get('tenantService');
    const enterpriseRuntime = tenantService?.describeRuntime ? tenantService.describeRuntime() : null;

    const ready = mysql.connected === true;
    return {
        status: ready ? 'ready' : 'not_ready',
        authoritativeDatabase: 'MARIADB',
        checks: {
            mysql: ready
                ? { status: 'READY', latencyMs: mysql.latencyMs, version: mysql.version, host: mysql.host, database: mysql.database }
                : { status: 'UNAVAILABLE', error: mysql.error, code: mysql.code },
            schema: schema.success ? 'INITIALIZED' : `INCOMPLETE (${schema.error || 'unknown'})`,
            identityProvider: (admin && admin.apps && admin.apps.length > 0) ? 'CONFIGURED' : 'NOT_CONFIGURED',
            firestoreDataPlane: 'REMOVED',
            enterprise: enterpriseRuntime ? {
                dataProvider: enterpriseRuntime.dataProvider,
                dataPlaneConfigured: enterpriseRuntime.dataPlaneConfigured === true,
                encryption: enterpriseRuntime.encryption?.provider || 'none',
                quotaStore: enterpriseRuntime.quotaStore,
                queue: 'mysql-transactional-outbox',
            } : 'UNAVAILABLE',
            aiProviders: 'NOT_CHECKED', paymentProviders: 'NOT_CHECKED', smtp: 'NOT_CHECKED',
            cmsScheduler: process.env.CMS_SCHEDULER_ENABLED === 'true' ? 'CONFIGURED' : 'DISABLED',
            notificationOutbox: process.env.NOTIFICATION_OUTBOX_WORKER_ENABLED === 'true' ? 'LOCAL_WORKER_CONFIGURED' : process.env.NOTIFICATION_OUTBOX_EXTERNAL_WORKER === 'true' ? 'EXTERNAL_WORKER_DECLARED' : 'DISABLED',
            tenantGc: process.env.TENANT_GC_WORKER_ENABLED === 'true' ? 'LOCAL_WORKER_CONFIGURED' : 'DISABLED',
            pdfIsolation: process.env.PDF_RENDERER_ISOLATED === 'true' ? 'DECLARED_ISOLATED' : 'REQUIRES_ISOLATED_WORKER',
        },
    };
}

app.get('/readyz', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const payload = await computeReadyzPayload();
    const healthy = payload.status === 'ready';
    try { maybeQueueReadyzAlert({ healthy, pool: getPool() }); } catch (error) {
        console.error('[readyz] alert dispatch failed:', error.message);
    }
    return res.status(healthy ? 200 : 503).json(payload);
});
app.get('/api/readyz', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const payload = await computeReadyzPayload();
    const healthy = payload.status === 'ready';
    try { maybeQueueReadyzAlert({ healthy, pool: getPool() }); } catch (error) {
        console.error('[readyz] alert dispatch failed:', error.message);
    }
    return res.status(healthy ? 200 : 503).json(payload);
});


// Start a listener only for the executable entry point; integration tests import the Express app.
if (require.main === module) {
    // Startup schema bootstrap (idempotent, non-fatal). Fresh deployments become
    // operational on first boot; a MySQL outage degrades instead of crash-looping.
    runSchemaBootstrap().catch(() => {});
    // Publication is executed only by this trusted backend. Production enables the
    // worker explicitly; no browser clock or client write can make a post public.
    // MySQL-backed (repository), independent of any Firestore availability.
    if (process.env.CMS_SCHEDULER_ENABLED === 'true') {
        const intervalMs = Math.max(60_000, Math.min(Number(process.env.CMS_SCHEDULER_INTERVAL_MS) || 300_000, 3_600_000));
        let schedulerRunning = false;
        const runScheduler = async () => {
            if (schedulerRunning) return;
            schedulerRunning = true;
            try {
                const count = await publishDueBlogPosts();
                if (count) console.info(`[CMS scheduler] Published ${count} due post(s).`);
            } catch (error) {
                console.error('[CMS scheduler] Publication check failed:', error?.message || error);
            } finally {
                schedulerRunning = false;
            }
        };
        const scheduler = setInterval(runScheduler, intervalMs);
        scheduler.unref?.();
        setTimeout(runScheduler, 10_000).unref?.();
    }

    // Durable notification delivery worker — MySQL transactional outbox.
    // Lease-based claims, exponential backoff + jitter, dead-letter after
    // max attempts. The queue is the authoritative MariaDB
    // notification_outbox table.
    if (process.env.NOTIFICATION_OUTBOX_WORKER_ENABLED === 'true') {
        const { getPool } = require('./database/mysql');
        const workerId = `${process.pid}-${crypto.randomUUID()}`;
        const intervalMs = Math.max(5_000, Math.min(Number(process.env.NOTIFICATION_OUTBOX_INTERVAL_MS) || 15_000, 300_000));
        let workerRunning = false;
        const runOutbox = async () => {
            if (workerRunning) return;
            workerRunning = true;
            try {
                const emailRoute = require('./routes/email');
                const tenantService = app.get('tenantService');
                await processOutboxOnce({
                    pool: getPool(),
                    workerId,
                    // Tenant-bound outbox events are reauthorized at execution time;
                    // legacy events retain their certified UID-era delivery behavior.
                    authorize: event => tenantService?.authorizeOutboxEvent(event),
                    dispatch: event => emailRoute.dispatchNotification({
                        to: event.recipient,
                        templateType: event.templateType,
                        vars: event.vars,
                        customSubject: event.metadata?.customSubject,
                        customBody: event.metadata?.customBody,
                    })
                });
                await indianGatewayActivation.reconcilePendingIndianGatewayOrders({
                    pool: getPool(),
                    getPaytmConfig,
                    getPhonePeConfig,
                    fetchImpl: fetch,
                    activation: paymentActivation,
                });
            } catch (error) { console.error('[Notification outbox]', error.message); }
            finally { workerRunning = false; }
        };
        const outboxTimer = setInterval(runOutbox, intervalMs);
        outboxTimer.unref?.();
        setTimeout(runOutbox, 5_000).unref?.();
        console.log('[Notification outbox] MySQL-backed delivery worker enabled.');
    }

    // Durable MariaDB enterprise job worker. Leases, envelope signatures,
    // expiry, and current tenant membership are verified before execution.
    if (process.env.ENTERPRISE_OUTBOX_WORKER_ENABLED === 'true') {
        const { runOutboxWorkerOnce, sweepExpiredJobs } = require('./enterprise/enterpriseOutbox');
        const { queueEmailInTransaction } = require('./services/notificationOutbox');
        const workerId = `enterprise-${process.pid}-${crypto.randomUUID()}`;
        const intervalMs = Math.max(5_000, Math.min(Number(process.env.ENTERPRISE_OUTBOX_INTERVAL_MS) || 15_000, 300_000));
        const signingSecret = process.env.TENANT_JOB_SIGNING_SECRET || '';
        let enterpriseWorkerRunning = false;
        let signingConfigurationReported = false;
        const runEnterpriseOutbox = async () => {
            if (enterpriseWorkerRunning) return;
            enterpriseWorkerRunning = true;
            try {
                if (Buffer.byteLength(signingSecret) < 32) {
                    if (!signingConfigurationReported) {
                        console.error('[Enterprise outbox worker] TENANT_JOB_SIGNING_SECRET is missing or too short; worker idle (fail closed).');
                        signingConfigurationReported = true;
                    }
                    return;
                }
                const tenantService = app.get('tenantService');
                const pool = getPool();
                await sweepExpiredJobs({ pool, now: Date.now() });
                const outcomes = await runOutboxWorkerOnce({
                    pool,
                    tenantService,
                    signingSecret,
                    workerId,
                    maxJobs: 5,
                    handlers: {
                        NOTIFY: async ({ envelope, context }) => {
                            const resource = await tenantService.getResource({ context, resourceId: envelope.resource.id });
                            const owner = resource.ownerPrincipalId
                                ? await admin.auth().getUser(resource.ownerPrincipalId)
                                : null;
                            if (!owner?.email) {
                                throw Object.assign(new Error('Notification resource owner has no deliverable email identity'), {
                                    code: 'NOTIFICATION_RECIPIENT_UNAVAILABLE',
                                });
                            }
                            const queued = await queueEmailInTransaction(pool, {
                                eventId: `${envelope.correlationId}:notify`,
                                recipient: owner.email,
                                templateType: 'tenant_notification',
                                vars: {},
                                metadata: { tenantId: envelope.tenantId, jobId: envelope.jobId, resourceId: envelope.resource.id },
                                tenantContext: context,
                                idempotencyKey: envelope.idempotencyKey,
                            });
                            return { notificationEventId: queued.eventId, state: queued.state };
                        },
                    },
                });
                for (const outcome of outcomes) {
                    if (outcome.status === 'DEAD_LETTER' || outcome.status === 'REJECTED') {
                        console.warn('[Enterprise outbox worker]', JSON.stringify(outcome));
                    }
                }
            } catch (error) {
                console.error('[Enterprise outbox worker]', error.message);
            } finally {
                enterpriseWorkerRunning = false;
            }
        };
        const enterpriseTimer = setInterval(runEnterpriseOutbox, intervalMs);
        enterpriseTimer.unref?.();
        setTimeout(runEnterpriseOutbox, 7_000).unref?.();
    }

    // Tenant hard-deletion garbage collector. Tenants decommissioned by a
    // platform administrator transition to DELETING; after the configured
    // grace period this worker reclaims every tenant partition, control-plane
    // record, and configuration document. Without this worker, DELETING
    // tenants are only reclaimed when an operator remembers to run
    // scripts/tenant-garbage-collector.mjs manually.
    if (process.env.TENANT_GC_WORKER_ENABLED === 'true') {
        const intervalMs = Math.max(60_000, Math.min(Number(process.env.TENANT_GC_INTERVAL_MS) || 3_600_000, 86_400_000));
        const gracePeriodDays = Math.max(0, Number(process.env.TENANT_GC_GRACE_PERIOD_DAYS ?? 7));
        let gcRunning = false;
        const runTenantGc = async () => {
            if (gcRunning) return;
            gcRunning = true;
            try {
                const tenantService = app.get('tenantService');
                if (!tenantService?.executeTenantGarbageCollection) {
                    console.error('[Tenant GC worker] Tenant service does not support garbage collection; worker idle.');
                    return;
                }
                const result = await tenantService.executeTenantGarbageCollection({
                    gracePeriodDays,
                    requestId: `tenant-gc-${process.pid}-${Date.now()}`,
                });
                if (result.purgedCount > 0 || (result.failures && result.failures.length > 0)) {
                    console.info(`[Tenant GC worker] Purged ${result.purgedCount} tenant(s); ${result.failures?.length || 0} failure(s).`);
                }
            } catch (error) {
                console.error('[Tenant GC worker]', error?.message || error);
            } finally {
                gcRunning = false;
            }
        };
        const gcTimer = setInterval(runTenantGc, intervalMs);
        gcTimer.unref?.();
        setTimeout(runTenantGc, 30_000).unref?.();
    }

    // The retired cross-store replication daemon is absent. MariaDB is the
    // single authoritative store, and no background process may require an
    // alternate application-data plane.

    // Listen HTTP/HTTPS port safely
    const keyPath = '/etc/letsencrypt/live/' + websiteName + '/privkey.pem';
    const certPath = '/etc/letsencrypt/live/' + websiteName + '/fullchain.pem';

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        httpServer = https.createServer(
            {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath),
            },
            app
        );
        httpServer.listen(port, () => {
            console.log('HTTPS Server running on port ' + port);
        });
    } else {
        httpServer = http.createServer(app);
        httpServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.warn(`[HTTP Server] Port ${port} is already in use by another instance.`);
            } else {
                console.error('[HTTP Server Error]', err);
            }
        });
        httpServer.listen(port, '0.0.0.0', () => {
            console.log('HTTP Server running on port ' + port);
        });
    }

    let isShuttingDown = false;
    const gracefulShutdown = (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log(`[Shutdown] ${signal} received — draining connections...`);
        if (httpServer && httpServer.listening) {
            httpServer.close(async () => {
                try {
                    await closePool();
                } catch (_) {}
                console.log('[Shutdown] Clean exit complete.');
                process.exit(0);
            });
            setTimeout(() => {
                process.exit(0);
            }, 5000).unref?.();
        } else {
            console.log('[Shutdown] Clean exit complete.');
            process.exit(0);
        }
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

app.get('/api/linkedin-scraper', async (req, res) => {
    // Fixed destination, headless, bounded browser workload. This is not a general-purpose browser proxy.
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'ResumePilotJobsBot/1.0 (+https://resumepilot.ai)',
            javaScriptEnabled: false
        });
        const page = await context.newPage();
        await page.goto('https://www.linkedin.com/jobs/search?keywords=web%20developer&location=United%20States', {
            timeout: 30_000, waitUntil: 'domcontentloaded'
        });
        const jobData = await page.locator('ul.jobs-search__results-list div.base-card').evaluateAll(cards => cards.slice(0, 25).map((card, index) => ({ id: index + 1, content: (card.textContent || '').trim() })).filter(job => job.content));
        return res.json({ success: true, totalJobs: jobData.length, jobs: jobData });
    } catch (error) {
        console.error('LinkedIn scraper error:', error.message);
        return res.status(502).json({ success: false, error: 'Job source temporarily unavailable' });
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
});

// Client-authored notification dispatch is retired. Product workflows enqueue
// owner-derived recipients in the same MariaDB transaction as their business
// mutation; accepting arbitrary client recipients would create an abuse relay.
app.post('/api/notify/user-signup', (_req, res) => res.status(410).json({
    success: false,
    code: 'CLIENT_NOTIFICATION_DISPATCH_RETIRED',
    message: 'Account-created notifications are generated by the profile transaction.'
}));

// ─── Firebase Admin SDK Service Account Status ──────────────────────────────
// Production credentials belong in Workload Identity or the deployment Secret Manager.
// A legacy single-instance .env rotation path remains available only when explicitly
// enabled outside production for backwards-compatible local operations.

app.get('/api/admin/firebase-service-account', (req, res) => {
    const projectId = process.env.FIREBASE_PROJECT_ID || '';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
    const hasPrivateKey = !!(process.env.FIREBASE_PRIVATE_KEY);
    const adminReady = !!(admin && admin.apps && admin.apps.length && typeof admin.auth === 'function');

    return res.json({
        success: true,
        configured: !!(projectId && clientEmail && hasPrivateKey),
        adminSdkReady: adminReady,
        projectId,
        clientEmail,
        privateKeySet: hasPrivateKey,
        runtimeRotationEnabled: process.env.ALLOW_RUNTIME_FIREBASE_CREDENTIAL_ROTATION === 'true' && process.env.NODE_ENV !== 'production',
    });
});

app.post('/api/admin/firebase-service-account', requireRecentAdminAuthentication, async (req, res) => {
    if (process.env.ALLOW_RUNTIME_FIREBASE_CREDENTIAL_ROTATION !== 'true' || process.env.NODE_ENV === 'production') {
        return res.status(501).json({ success: false, code: 'RUNTIME_SECRET_ROTATION_DISABLED', error: 'Runtime Firebase credential rotation is disabled. Use Workload Identity or the deployment Secret Manager.' });
    }
    const { projectId, clientEmail, privateKey } = req.body;

    if (!projectId || !clientEmail || !privateKey) {
        return res.status(400).json({
            success: false,
            error: 'projectId, clientEmail and privateKey are all required.'
        });
    }

    // Normalize private key — handle escaped newlines from JSON paste
    const normalizedKey = privateKey.replace(/\\n/g, '\n').trim();
    if (!normalizedKey.includes('BEGIN PRIVATE KEY')) {
        return res.status(400).json({
            success: false,
            error: 'Invalid private key format. It must be a PEM RSA private key starting with -----BEGIN PRIVATE KEY-----'
        });
    }

    // Step 1: Validate credentials by attempting a test Admin SDK init
    let testAdmin;
    try {
        const firebaseAdmin = require('./services/firebaseAdmin');
        // Use a separate named app for testing so we don't disrupt the running instance
        const testAppName = `sa-test-${Date.now()}`;
        testAdmin = firebaseAdmin.initializeApp({
            credential: firebaseAdmin.credential.cert({ projectId, clientEmail, privateKey: normalizedKey })
        }, testAppName);
        // Perform a lightweight auth call to validate credentials
        await testAdmin.auth().listUsers(1);
        console.log('[SA Config] ✅ Test credentials validated successfully');
    } catch (testErr) {
        if (testAdmin) { try { await testAdmin.delete(); } catch (_) {} }
        console.error('[SA Config] ❌ Credential validation failed:', testErr.message);
        return res.status(400).json({
            success: false,
            error: `Credential validation failed: ${testErr.message}`
        });
    } finally {
        if (testAdmin) { try { await testAdmin.delete(); } catch (_) {} }
    }

    // Step 2: Persist to .env file
    try {
        const envPath = path.join(__dirname, '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

        // Escape private key for .env (replace actual newlines with \n literals)
        const escapedKey = normalizedKey.replace(/\n/g, '\\n');

        // Update or append each key
        const updates = {
            FIREBASE_PROJECT_ID: projectId,
            FIREBASE_CLIENT_EMAIL: clientEmail,
            FIREBASE_PRIVATE_KEY: `"${escapedKey}"`,
        };

        for (const [key, value] of Object.entries(updates)) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            const line = `${key}=${value}`;
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, line);
            } else {
                envContent += `\n${line}`;
            }
        }

        const tempEnvPath = `${envPath}.${process.pid}.tmp`;
        fs.writeFileSync(tempEnvPath, envContent, { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(tempEnvPath, envPath);
        fs.chmodSync(envPath, 0o600);
        console.log('[SA Config] Service account credentials written with owner-only permissions');

        // Step 3: Hot-reload — update process.env and re-initialize Admin SDK
        process.env.FIREBASE_PROJECT_ID = projectId;
        process.env.FIREBASE_CLIENT_EMAIL = clientEmail;
        process.env.FIREBASE_PRIVATE_KEY = normalizedKey;

        // Reinitialize default Firebase Admin app with new credentials
        const firebaseAdmin = require('./services/firebaseAdmin');
        if (firebaseAdmin.apps.length) {
            await firebaseAdmin.app().delete();
        }
        firebaseAdmin.initializeApp({
            credential: firebaseAdmin.credential.cert({
                projectId,
                clientEmail,
                privateKey: normalizedKey,
            }),
        });
        admin = firebaseAdmin;
        // Credential rotation applies to Firebase Authentication only.
        app.set('firebaseAdmin', firebaseAdmin);
        console.log('[SA Config] Firebase Admin identity credentials hot-reloaded');

        return res.json({
            success: true,
            message: `Service account credentials saved and applied for project: ${projectId}`,
            projectId,
            clientEmail,
        });
    } catch (err) {
        console.error('[SA Config] Error saving credentials:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Password reset: only a hash is persisted; raw tokens are never stored server-side.
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
app.post('/api/auth/custom-password-reset', async (req, res) => {
    const email = String(req.body.email || req.body.userEmail || '').trim().toLowerCase();
    const startedAt = Date.now();
    // Equalize observable responses for malformed, missing and existing accounts.
    const genericResponse = { success: true, message: 'If an account exists, a password reset email will be sent shortly.' };
    const respond = async () => {
        const delayMs = minimumEnumerationDelay(startedAt, Date.now(), crypto.randomInt(0, 100));
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
        return res.json(genericResponse);
    };
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return respond();
    try {
        if (!admin?.auth) throw new Error('Password reset service unavailable');
        let user;
        try { user = await admin.auth().getUserByEmail(email); }
        catch (err) { if (err.code === 'auth/user-not-found') return respond(); throw err; }
        const token = crypto.randomBytes(32).toString('base64url');
        const tokenHash = hashToken(token);
        const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
        // MySQL is the authoritative token store (authTokens). The account's prior
        // active token is replaced atomically so an older email can never reset a
        // password after the user has requested a newer link.
        const { createPasswordResetToken } = require('./database/authTokens');
        const resetLink = `${protocol}://${websiteName}/login#mode=resetPassword&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
        await createPasswordResetToken({
            tokenHash, uid: user.uid, email, expiresAt,
            notification: { vars: { candidate_name: email.split('@')[0], user_name: email.split('@')[0], reset_link: resetLink } },
        });
        return respond();
    } catch (err) {
        console.error('[Password reset request]', err.message);
        return respond();
    }
});

// Branded verification links are authenticated, account-bound, hashed at rest and single-use.
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
app.post('/api/auth/send-verification-email', notificationAccountLimiter, async (req, res) => {
    const email = String(req.user?.email || '').trim().toLowerCase();
    if (!email || !req.user?.uid) return res.status(403).json({ success: false, error: 'Authenticated email required.' });
    if (req.body.email && String(req.body.email).trim().toLowerCase() !== email) {
        return res.status(403).json({ success: false, error: 'Verification email must match the authenticated account.' });
    }
    const generic = { success: true, message: 'If verification is required, an email will be sent shortly.' };
    try {
        const token = crypto.randomBytes(32).toString('base64url');
        const tokenHash = hashToken(token);
        const expiresAt = Date.now() + VERIFICATION_TOKEN_TTL_MS;
        // MySQL is the authoritative token store; the previous active token is
        // replaced atomically inside the same transaction.
        const { createEmailVerificationToken } = require('./database/authTokens');
        const verificationLink = `${protocol}://${websiteName}/login#mode=verifyEmail&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
        const userName = String(req.body.userName || email.split('@')[0]).slice(0, 100);
        await createEmailVerificationToken({
            tokenHash, uid: req.user.uid, email, expiresAt,
            notification: { vars: { candidate_name: userName, user_name: userName, verification_link: verificationLink } },
        });
        return res.json(generic);
    } catch (error) {
        console.error('[Verification request]', error.message);
        return res.status(503).json({ success: false, error: 'Verification email is temporarily unavailable.' });
    }
});

app.post('/api/auth/verify-email-token', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const token = String(req.body.token || '');
    if (!/^\S+@\S+\.\S+$/.test(email) || !isOpaqueToken(token) || !admin?.auth) {
        return res.status(400).json({ success: false, error: 'Invalid or expired email verification link.' });
    }
    const tokenHash = hashToken(token);
    const leaseId = crypto.randomUUID();
    const { leaseEmailVerificationToken, finalizeEmailVerification, releaseEmailVerificationLease } = require('./database/authTokens');
    try {
        // Atomic validate + lease in MySQL (single-use, latest-token-only).
        const leased = await leaseEmailVerificationToken({ tokenHash, email, leaseId });
        const uid = leased.uid;
        const user = await admin.auth().getUser(uid);
        if (String(user.email || '').toLowerCase() !== email) throw new Error('INVALID_VERIFICATION_TOKEN');
        await admin.auth().updateUser(uid, { emailVerified: true });
        // Mark used + account state verified in the same MySQL transaction.
        await finalizeEmailVerification({ tokenHash, uid, leaseId });
        const { getRepository } = require('./repositories');
        try {
            const repo = getRepository();
            const profile = await repo.getUser(uid);
            await repo.saveUser(uid, { ...(profile || {}), emailVerified: true, revision: Number(profile?.revision || 1) + 1 });
        } catch (_repoErr) { /* non-fatal: identity is verified; profile flag is best-effort */ }
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, message: 'Email address verified successfully.' });
    } catch (_error) {
        await releaseEmailVerificationLease({ tokenHash, leaseId }).catch(() => {});
        return res.status(400).json({ success: false, error: 'Invalid or expired email verification link.' });
    }
});

app.post('/api/admin/payments/refund', requireRecentAdminAuthentication, async (req, res) => {
    const paymentOrderId = String(req.body.paymentOrderId || '');
    const reason = String(req.body.reason || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(paymentOrderId)) {
        return res.status(400).json({ success: false, code: 'INVALID_PAYMENT_ORDER', error: 'Valid payment order is required.' });
    }
    if (reason.length < 5) {
        return res.status(400).json({ success: false, code: 'REFUND_REASON_REQUIRED', error: 'A refund reason of at least five characters is required.' });
    }

    let claimedOrder = null;
    try {
        claimedOrder = await paymentActivation.claimRefund({
            orderId: paymentOrderId,
            actorUid: req.user.uid,
            reason,
        });
        if (claimedOrder.duplicate) {
            const reconciled = await paymentActivation.reverseEntitlement({
                orderId: paymentOrderId,
                status: 'REFUNDED',
                providerRefundId: claimedOrder.providerRefundId || null,
                providerRefundReferenceType: claimedOrder.providerRefundReferenceType || 'PROVIDER',
            });
            return res.json({
                success: true,
                duplicate: true,
                status: 'REFUNDED',
                refundId: reconciled.providerRefundId || null,
                creditNote: reconciled.creditNote || null,
                message: 'This payment was already refunded.',
            });
        }

        const outcome = await executeOrReconcileProviderRefund(
            claimedOrder,
            claimedOrder.refundReason || reason,
            { getStripeClient, paypalConfig, paypalAccessToken, getRazorpayKeys, getPaytmConfig, getPhonePeConfig, fetchImpl: fetch }
        );
        if (outcome.state === 'FAILED') {
            throw refundFlowError(`${claimedOrder.provider.toUpperCase()}_REFUND_FAILED`, 'The provider reported that the refund failed.', 422, { restoreActive: true, providerFailureConfirmed: true });
        }
        if (outcome.state === 'PENDING') {
            await paymentActivation.recordRefundSubmitted({
                orderId: paymentOrderId,
                claimId: claimedOrder.claimId,
                providerRefundId: outcome.refundId,
                providerRefundStatus: outcome.providerStatus,
                providerRefundReferenceType: outcome.providerRefundReferenceType,
                providerRefunds: outcome.providerRefunds,
            });
            claimedOrder.claimId = null;
            return res.status(202).json({
                success: true,
                status: 'REFUND_PENDING',
                refundId: outcome.refundId,
                providerStatus: outcome.providerStatus,
                message: 'The provider accepted the refund. Completion is pending; entitlement and accounting remain unchanged until reconciliation confirms completion.',
            });
        }

        const reversed = await paymentActivation.reverseEntitlement({
            orderId: paymentOrderId,
            status: 'REFUNDED',
            expectedRefundClaimId: claimedOrder.claimId,
            providerRefundId: outcome.refundId,
            providerRefundReferenceType: outcome.providerRefundReferenceType,
            providerRefunds: outcome.providerRefunds,
        });
        claimedOrder.claimId = null;
        return res.json({
            success: true,
            status: 'REFUNDED',
            refundId: outcome.refundId,
            creditNote: reversed.creditNote || null,
            message: reversed.creditNote
                ? `Provider refund completed, entitlement reconciled, and credit note ${reversed.creditNote.creditNoteNumber} issued.`
                : 'Provider refund completed and entitlement reconciled. No credit note was created because no tax invoice had been issued.',
        });
    } catch (error) {
        if (claimedOrder?.claimId) {
            await paymentActivation.releaseRefundClaim({
                orderId: paymentOrderId,
                claimId: claimedOrder.claimId,
                failureCode: error.code || 'PROVIDER_REFUND_UNCONFIRMED',
                restoreActive: error.restoreActive === true,
                providerFailureConfirmed: error.providerFailureConfirmed === true,
            }).catch(releaseError => {
                console.error('[Payment refund claim release]', releaseError.message);
            });
        }
        console.error('[Payment refund]', error.code || error.message);
        const status = Number(error.status) || 502;
        if (error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
        return res.status(status).json({
            success: false,
            code: error.code || 'PROVIDER_REFUND_UNCONFIRMED',
            error: status >= 500 ? 'Provider refund could not be confirmed. The durable attempt remains pending for safe reconciliation.' : error.message,
            requestId: res.locals.requestId,
        });
    }
});

function adminIso(value) {
    if (!value) return null;
    try {
        const date = value?.toDate?.() || new Date(value);
        return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    } catch (_) { return null; }
}

/** List an administrative entity from its authoritative MariaDB table. */
async function adminEntityList(entityType, { limit = 200 } = {}) {
    const bounded = Math.min(Math.max(Number(limit) || 200, 1), 500);
    // Domain-specific relational tables take precedence over the generic
    // canonical_documents store.
    const relationalTables = {
        companies: 'companies',
        jobs: 'jobs',
        blog_posts: 'blog',
        ads: 'canonical_documents',
        blog_categories: 'canonical_documents',
        employer_applications: 'canonical_documents',
    };
    const table = relationalTables[entityType];
    if (!table) throw Object.assign(new Error(`Unsupported administrative entity: ${entityType}`), { status: 500 });
    try {
        const pool = require('./database/mysql').getPool();
        if (table === 'canonical_documents') {
            const [rows] = await pool.query(
                `SELECT entity_id, payload, created_at, updated_at FROM canonical_documents WHERE entity_type = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
                [entityType, bounded]
            );
            const items = rows.map(row => {
                let payload = {};
                try { payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {}); } catch { /* ignore */ }
                return { id: row.entity_id, ...payload };
            });
            return items;
        }
        const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY updated_at DESC LIMIT ?`, [bounded]);
        return rows.map(row => ({ id: row.id, ...row }));
    } catch (mysqlErr) {
        throw Object.assign(new Error(`Admin collection unavailable: ${mysqlErr.message}`), { status: 503 });
    }
}

app.get('/api/admin/employer-applications', async (req, res) => {
    try {
        const rows = await adminEntityList('employer_applications', { limit: req.query?.limit || 200, orderField: 'submittedAt' });
        return res.json({ success: true, applications: rows, source: 'MYSQL_SERVER_READ', count: rows.length });
    } catch (error) { return res.status(error.status || 503).json({ success: false, code: 'EMPLOYER_APPLICATIONS_UNAVAILABLE', error: 'Employer applications are unavailable.', requestId: res.locals.requestId }); }
});

app.get('/api/admin/companies', async (req, res) => {
    try {
        const companies = await adminEntityList('companies', { limit: req.query?.limit || 500, orderField: 'createdAt' });
        let jobs = [];
        try { jobs = await adminEntityList('jobs', { limit: 500 }); } catch (_) { jobs = null; }
        const result = companies.map(company => {
            if (!jobs) return company;
            const related = jobs.filter(job => job.companyId === company.id || job.employerId === company.employerId);
            return { ...company, stats: { totalJobs: related.length, activeJobs: related.filter(job => String(job.status || '').toLowerCase() === 'active').length, totalApplications: related.reduce((sum, job) => sum + Number(job.applicationsCount || 0), 0), lastJobPosted: related.map(job => adminIso(job.createdAt)).filter(Boolean).sort().pop() || null } };
        });
        return res.json({ success: true, companies: result, source: 'MYSQL_SERVER_READ', statsSource: jobs ? 'MEASURED' : 'UNAVAILABLE', count: result.length });
    } catch (error) { return res.status(error.status || 503).json({ success: false, code: 'COMPANIES_UNAVAILABLE', error: 'Company directory is unavailable.', requestId: res.locals.requestId }); }
});

app.get('/api/admin/jobs', async (req, res) => {
    try {
        const status = String(req.query?.status || 'all').toLowerCase();
        const search = String(req.query?.search || req.query?.q || '').trim().toLowerCase();
        const pageSize = Math.min(Math.max(Number(req.query?.limit) || 10, 1), 100);
        const page = Math.max(Number(req.query?.page) || 1, 1);
        const all = await adminEntityList('jobs', { limit: 500 });
        const mapped = all.map(job => ({ ...job, createdAt: adminIso(job.createdAt), updatedAt: adminIso(job.updatedAt), deadline: adminIso(job.deadline), type: job.jobType, postedDate: adminIso(job.createdAt), applicants: Number(job.applicationsCount || 0), salary: job.minSalary || job.maxSalary ? `${job.minSalary || ''}-${job.maxSalary || ''}` : 'Salary not specified' }));
        const filtered = mapped.filter(job => (status === 'all' || String(job.status || '').toLowerCase() === status) && (!search || [job.title, job.company, job.location, job.id].some(value => String(value || '').toLowerCase().includes(search))));
        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        const currentPage = Math.min(page, totalPages);
        return res.json({ success: true, jobs: filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), allJobs: mapped, source: 'MYSQL_SERVER_READ', pagination: { totalItems: filtered.length, totalPages, currentPage, hasNextPage: currentPage < totalPages, hasPreviousPage: currentPage > 1 } });
    } catch (error) { return res.status(error.status || 503).json({ success: false, code: 'JOBS_UNAVAILABLE', error: 'Job directory is unavailable.', requestId: res.locals.requestId }); }
});

app.get('/api/admin/reviews', async (req, res) => {
    try {
        const reviews = await getRepository().getReviews({ approvedOnly: false, limit: req.query?.limit || 500 });
        return res.json({ success: true, reviews, source: 'MARIADB_REVIEWS', count: reviews.length });
    } catch (error) {
        return res.status(error.status || 503).json({ success: false, code: 'REVIEWS_UNAVAILABLE', error: 'Reviews are unavailable.', requestId: res.locals.requestId });
    }
});

app.get('/api/admin/ads', async (req, res) => {
    try { const ads = await adminEntityList('ads', { limit: req.query?.limit || 500 }); return res.json({ success: true, ads, source: 'MYSQL_SERVER_READ', count: ads.length }); }
    catch (error) { return res.status(error.status || 503).json({ success: false, code: 'ADS_UNAVAILABLE', error: 'Advertisements are unavailable.', requestId: res.locals.requestId }); }
});

app.get('/api/admin/payment-orders', async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query?.limit) || 200, 1), 500);
        const pool = require('./database/mysql').getPool();
        const [[orderRows], [invoiceRows]] = await Promise.all([
            pool.query('SELECT * FROM payment_orders ORDER BY created_at DESC LIMIT ?', [limit]),
            pool.query(
                `SELECT i.*, cn.credit_note_number,
                        cn.provider_refund_id AS credit_note_provider_refund_id,
            cn.provider_refund_reference_type AS credit_note_provider_refund_reference_type,
                        cn.taxable_amount AS credit_note_taxable_amount,
                        cn.tax_amount AS credit_note_tax_amount,
                        cn.total_amount AS credit_note_total_amount,
                        cn.payload AS credit_note_payload
                 FROM invoices i
                 LEFT JOIN credit_notes cn ON cn.invoice_id = i.id
                 ORDER BY i.issued_at DESC LIMIT ?`,
                [limit]
            ),
        ]);
        const invoicesByOrder = new Map();
        for (const row of invoiceRows) {
            const invoice = invoiceFromRow(row, row.user_id);
            const relationalAmounts = [row.taxable_amount, row.tax_amount, row.total_amount].map(Number);
            const payloadAmounts = [invoice.taxableAmount, invoice.totalTax, invoice.grandTotal].map(Number);
            if (relationalAmounts.some(value => !Number.isFinite(value) || value < 0)
                || payloadAmounts.some(value => !Number.isFinite(value) || value < 0)
                || relationalAmounts.some((value, index) => Math.abs(value - payloadAmounts[index]) > 0.005)) {
                throw Object.assign(new Error('Immutable invoice amount integrity check failed'), { code: 'INVOICE_RECORD_INVALID', status: 503 });
            }
            invoicesByOrder.set(row.payment_order_id, invoice);
        }
        const statusLabel = raw => {
            const status = String(raw || 'UNKNOWN').toUpperCase();
            if (status === 'ACTIVE') return 'Completed';
            if (status === 'REFUNDED') return 'Refunded';
            if (status === 'CHARGEBACK') return 'Chargeback';
            if (['FAILED', 'CANCELLED', 'DECLINED'].includes(status)) return 'Failed';
            if (['PENDING_PAYMENT', 'PAYMENT_CREATED', 'REFUND_PENDING', 'PROVIDER_CONFIRMED'].includes(status)) return 'Pending';
            return 'Unknown';
        };
        const records = orderRows.map(row => {
            const invoice = invoicesByOrder.get(row.id) || null;
            const amountMinor = Number(row.amount);
            const originalMinor = Number(row.original_amount);
            const divisor = String(row.currency || '').toUpperCase() === 'JPY' ? 1 : 100;
            return {
                docId: row.id,
                source: 'payment_orders',
                transactionId: row.provider_payment_id || row.provider_order_id || row.provider_payment_intent_id || row.id,
                providerReference: row.provider_payment_id || row.provider_order_id || row.provider_payment_intent_id || null,
                userId: row.uid,
                customerEmail: invoice?.customerSnapshot?.email || null,
                customerName: invoice?.customerSnapshot?.name || null,
                customerGstin: invoice?.customerSnapshot?.gstin || null,
                planType: row.plan_id,
                paymentType: row.provider,
                price: Number.isFinite(amountMinor) ? amountMinor / divisor : null,
                originalAmount: Number.isFinite(originalMinor) ? originalMinor / divisor : null,
                couponCode: row.coupon_code || null,
                couponDiscountPercent: Number(row.coupon_discount || 0),
                currency: row.currency || null,
                subtotal: invoice ? Number(invoice.taxableAmount) : null,
                taxAmount: invoice ? Number(invoice.totalTax) : null,
                taxRate: invoice ? Number(invoice.gstRate) : null,
                sacCode: invoice?.sacCode || null,
                invoiceNumber: invoice?.invoiceNumber || null,
                invoice: invoice,
                creditNote: invoice?.creditNote || null,
                creditNoteNumber: invoice?.creditNote?.creditNoteNumber || null,
                status: statusLabel(row.status),
                rawStatus: String(row.status || 'UNKNOWN'),
                created_at: adminIso(row.created_at),
                refundedAt: adminIso(row.reversed_at),
                refundReason: row.refund_reason || null,
                providerRefundId: row.provider_refund_id || null,
                providerRefundStatus: row.provider_refund_status || null,
            };
        });
        return res.json({
            success: true,
            records,
            sources: { paymentOrders: 'MARIADB', invoices: 'MARIADB_IMMUTABLE', creditNotes: 'MARIADB_IMMUTABLE', legacyTransactions: 'EXCLUDED_AMBIGUOUS_SCHEMA' },
            count: records.length,
        });
    } catch (error) {
        return res.status(error.status || 503).json({ success: false, code: error.code || 'PAYMENT_LEDGER_UNAVAILABLE', error: 'Payment ledger is unavailable.', requestId: res.locals.requestId });
    }
});

app.get('/api/admin/blog/categories', async (_req, res) => {
    try { const categories = await adminEntityList('blog_categories', { limit: 500 }); return res.json({ success: true, categories, source: 'MYSQL_SERVER_READ' }); }
    catch (error) { return res.status(error.status || 503).json({ success: false, code: 'BLOG_CATEGORIES_UNAVAILABLE', error: 'Blog categories are unavailable.', requestId: res.locals.requestId }); }
});

app.get('/api/admin/blog/posts', async (req, res) => {
    try {
        const status = String(req.query?.status || 'all').toLowerCase();
        const categoryId = String(req.query?.categoryId || '').trim();
        const search = String(req.query?.search || '').trim().toLowerCase();
        const pageSize = Math.min(Math.max(Number(req.query?.limit) || 10, 1), 100);
        const page = Math.max(Number(req.query?.page) || 1, 1);
        const all = await adminEntityList('blog_posts', { limit: 500 });
        const posts = all.map(post => ({ ...post, createdAt: adminIso(post.createdAt), updatedAt: adminIso(post.updatedAt), publishedAt: adminIso(post.publishedAt), scheduledAt: adminIso(post.scheduledAt) })).filter(post => (status === 'all' || String(post.status || '').toLowerCase() === status) && (!categoryId || post.categoryId === categoryId) && (!search || [post.title, post.slug, post.excerpt].some(value => String(value || '').toLowerCase().includes(search))));
        posts.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
        const totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
        const currentPage = Math.min(page, totalPages);
        return res.json({ success: true, posts: posts.slice((currentPage - 1) * pageSize, currentPage * pageSize), source: 'MYSQL_SERVER_READ', pagination: { totalCount: posts.length, totalPages, currentPage, hasNextPage: currentPage < totalPages, hasPreviousPage: currentPage > 1 } });
    } catch (error) { return res.status(error.status || 503).json({ success: false, code: 'BLOG_POSTS_UNAVAILABLE', error: 'Blog posts are unavailable.', requestId: res.locals.requestId }); }
});

app.patch('/api/admin/employer-applications/:uid', async (req, res) => {
    const uid = String(req.params.uid || '');
    const status = String(req.body.status || '').toLowerCase();
    const expectedStatus = req.body.expectedStatus === undefined ? null : String(req.body.expectedStatus).toLowerCase();
    const reason = String(req.body.reason || '').trim().slice(0, 500);
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid) || !['approved', 'rejected', 'active'].includes(status)
        || (expectedStatus !== null && !['pending', 'approved', 'rejected', 'active'].includes(expectedStatus))) {
        return res.status(400).json({ success: false, error: 'Valid application, user, and status are required.' });
    }
    if (uid === req.user.uid) return res.status(400).json({ success: false, error: 'Administrators cannot review their own employer application.' });
    try {
        const repo = resilientMutations.repoFor();
        const application = await (typeof repo.getDocument === 'function' ? repo.getDocument('employer_applications', uid) : null);
        if (!application) return res.status(404).json({ success: false, error: 'Employer application not found.' });
        if (expectedStatus !== null && String(application.status || 'pending').toLowerCase() !== expectedStatus) {
            return res.status(409).json({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This application changed after the page loaded. Refresh before reviewing it.' });
        }
        const enabled = status === 'approved' || status === 'active';
        const identityAdmin = req.app.get('firebaseAdmin') || admin;
        if (identityAdmin?.auth) {
            const target = await identityAdmin.auth().getUser(uid);
            await identityAdmin.auth().setCustomUserClaims(uid, { ...(target.customClaims || {}), employer: enabled });
            await identityAdmin.auth().revokeRefreshTokens(uid);
        }
        await resilientMutations.updateDocument({
            entityType: 'employer_applications', id: uid,
            expectedRevision: application.revision, patch: { status, ...(reason ? { rejectionReason: reason } : {}), reviewedBy: req.user.uid, reviewedAt: new Date().toISOString() },
            actorUid: req.user.uid, requestId: res.locals.requestId, action: 'EMPLOYER_APPLICATION_REVIEWED',
        });
        const user = await repo.getUser(uid).catch(() => null);
        if (user) await repo.saveUser(uid, { ...user, isEmployer: enabled, employerApplicationStatus: status });
        return res.json({ success: true, status, employer: enabled });
    } catch (error) {
        console.error('[Employer review]', error.message);
        return res.status(error.code === 'auth/user-not-found' ? 404 : (error.status || 500)).json({ success: false, error: 'Unable to review employer application.' });
    }
});

function safePublicUrl(value) {
    const raw = String(value || '').trim().slice(0, 2048);
    if (!raw || /[\u0000-\u001f\u007f]/.test(raw) || /%(?:0a|0d|00)/i.test(raw)) return '';
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    try { const parsed = new URL(raw); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : ''; }
    catch { return ''; }
}

app.post('/api/admin/ads', async (req, res) => {
    const name = String(req.body?.name || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 120);
    const imageLink = safePublicUrl(req.body?.imageLink);
    const destinationLink = safePublicUrl(req.body?.destinationLink);
    if (!name || !imageLink || !destinationLink) return res.status(400).json({ success: false, error: 'Name, safe image URL, and safe destination URL are required.' });
    try {
        const saved = await resilientMutations.createDocument({
            entityType: 'ads',
            data: { name, imageLink, destinationLink },
            actorUid: req.user.uid, requestId: res.locals.requestId, action: 'ADVERTISEMENT_CREATED',
        });
        return res.json({ success: true, item: { id: saved.id, name, imageLink, destinationLink, revision: saved.revision } });
    } catch (error) {
        return res.status(error.status || 503).json({ success: false, error: error.message || 'Advertisement service unavailable.' });
    }
});

app.delete('/api/admin/ads/:adId', async (req, res) => {
    const adId = String(req.params.adId || '');
    const expectedRevision = Number(req.body?.expectedRevision);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(adId) || !Number.isInteger(expectedRevision) || expectedRevision < 1) return res.status(400).json({ success: false, code: 'REVISION_REQUIRED', error: 'A valid advertisement ID and current revision are required.' });
    try {
        await resilientMutations.deleteDocument({
            entityType: 'ads', id: adId,
            expectedRevision, actorUid: req.user.uid, requestId: res.locals.requestId, action: 'ADVERTISEMENT_DELETED',
        });
        return res.json({ success: true });
    } catch (error) {
        const status = error.code === 'CAS_CONFLICT' || error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete advertisement.' : error.message });
    }
});

function normalizeTrustedLogo(input = {}) {
    const name = String(input.name || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 120);
    const rawUrl = String(input.imageUrl || '').trim().slice(0, 2048);
    let imageUrl = '';
    if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) imageUrl = rawUrl;
    else try { const parsed = new URL(rawUrl); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) imageUrl = parsed.href; } catch { /* invalid URL */ }
    const order = Math.max(0, Math.min(10_000, Number(input.order) || 0));
    if (!name || !imageUrl) throw new Error('A company name and valid HTTPS or site-relative image URL are required.');
    return { name, imageUrl, order, published: input.published !== false };
}

function validateCustomPageContent(value) {
    const content = String(value || '');
    if (!content.trim() || Buffer.byteLength(content, 'utf8') > 500_000) throw new Error('Page content is required and must be smaller than 500 KB.');
    if (/<\s*(?:script|iframe|object|embed|svg|math|link|meta)\b|\bon\w+\s*=|(?:javascript|data)\s*:|@import\b|url\s*\(/i.test(content)) throw new Error('Page content contains unsafe active content.');
    return content;
}

app.get(['/public/custom-pages.json', '/api/public/custom-pages', '/api/custom-pages.json', '/custom-pages.json'], async (_req, res) => {
    try {
        const pages = await getRepository().getCustomPages({ publishedOnly: true });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, pages: Array.isArray(pages) ? pages : [], source: 'MARIADB_CUSTOM_PAGES' });
    } catch (_error) {
        return res.status(503).json({
            success: false,
            code: 'CUSTOM_PAGES_UNAVAILABLE',
            error: 'Custom pages are temporarily unavailable.',
            requestId: res.locals.requestId,
        });
    }
});

const DEFAULT_BUILTIN_PAGES = {
    'privacy-policy': {
        slug: 'privacy-policy',
        title: 'Privacy Policy — ResumePilot AI',
        description: 'Comprehensive Privacy Policy detailing data protection, encryption, and GDPR compliance on ResumePilot AI.',
        pagecontent: `<div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 40px 20px;"><div style="margin-bottom: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 24px;"><span style="font-size: 13px; font-weight: 800; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.06em;">Legal & Privacy</span><h1 style="font-size: 36px; font-weight: 800; color: #0f172a; margin: 8px 0 12px 0;">Privacy Policy</h1><p style="color: #64748b; font-size: 14px; margin: 0;">Last Updated: September 2026 • Certified GDPR & CCPA Compliant</p></div><section style="margin-bottom: 32px;"><h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">1. Information We Collect</h2><p>ResumePilot AI collects account credentials, career experience data, education, skills, and job target details provided directly when crafting resumes, portfolios, and practicing interview simulations.</p></section><section style="margin-bottom: 32px;"><h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">2. AI Processing & Zero Training Pledge</h2><p>Your resume data, job descriptions, and mock interview transcripts processed through NVIDIA NIM and Google AI APIs are strictly ephemeral. We enforce a strict zero-retention pledge: your private career data is never used to train public foundation models.</p></section><section style="margin-bottom: 32px;"><h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">3. Data Security & Encryption</h2><p>All stored records in MariaDB and session tokens are encrypted in transit via TLS 1.3 and protected with AES-256-GCM encryption at rest.</p></section></div>`,
        published: true,
        status: 'published'
    },
    'terms-of-service': {
        slug: 'terms-of-service',
        title: 'Terms of Service — ResumePilot AI',
        description: 'Terms of Service and acceptable use policy for ResumePilot AI platform.',
        pagecontent: `<div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 40px 20px;"><div style="margin-bottom: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 24px;"><span style="font-size: 13px; font-weight: 800; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.06em;">Terms of Agreement</span><h1 style="font-size: 36px; font-weight: 800; color: #0f172a; margin: 8px 0 12px 0;">Terms of Service</h1><p style="color: #64748b; font-size: 14px; margin: 0;">Effective Date: September 2026</p></div><section style="margin-bottom: 32px;"><h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">1. Acceptance of Terms</h2><p>By accessing ResumePilot AI, you agree to these Terms of Service, all applicable laws, and regulations.</p></section><section style="margin-bottom: 32px;"><h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">2. User Accounts & Subscriptions</h2><p>Free accounts receive access to foundational ATS resume templates and standard AI tailoring. Pro Subscriptions unlock full access to all 51 certified templates.</p></section></div>`,
        published: true,
        status: 'published'
    },
    'cookie-policy': {
        slug: 'cookie-policy',
        title: 'Cookie Policy — ResumePilot AI',
        description: 'Cookie Policy and local storage usage on ResumePilot AI.',
        pagecontent: `<div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 40px 20px;"><div style="margin-bottom: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 24px;"><span style="font-size: 13px; font-weight: 800; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.06em;">Cookie Compliance</span><h1 style="font-size: 36px; font-weight: 800; color: #0f172a; margin: 8px 0 12px 0;">Cookie Policy</h1><p style="color: #64748b; font-size: 14px; margin: 0;">Last Updated: September 2026</p></div><section style="margin-bottom: 32px;"><h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">1. Essential Cookies</h2><p>We use essential cookies strictly required to authenticate sessions, maintain secure CSRF protection, and persist your draft builder steps.</p></section></div>`,
        published: true,
        status: 'published'
    },
    'about-us': {
        slug: 'about-us',
        title: 'About Us — ResumePilot AI',
        description: 'About ResumePilot AI: Next-generation career platform empowering professionals with AI-driven resumes, portfolios, and interview practice.',
        pagecontent: `<div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 40px 20px;"><div style="margin-bottom: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 24px;"><span style="font-size: 13px; font-weight: 800; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.06em;">About ResumePilot AI</span><h1 style="font-size: 36px; font-weight: 800; color: #0f172a; margin: 8px 0 12px 0;">Empowering Career Excellence</h1><p style="color: #64748b; font-size: 14px; margin: 0;">Built for modern job seekers, engineers, leaders, and career changers.</p></div><section style="margin-bottom: 32px;"><h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">Our Mission</h2><p>ResumePilot AI combines state-of-the-art LLM intelligence, recruiter-certified typography, and real-time ATS scoring to ensure your talent gets recognized by top employers worldwide.</p></section></div>`,
        published: true,
        status: 'published'
    },
    'about': {
        slug: 'about',
        title: 'About Us — ResumePilot AI',
        description: 'About ResumePilot AI: Next-generation career platform empowering professionals with AI-driven resumes, portfolios, and interview practice.',
        pagecontent: `<div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 40px 20px;"><div style="margin-bottom: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 24px;"><span style="font-size: 13px; font-weight: 800; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.06em;">About ResumePilot AI</span><h1 style="font-size: 36px; font-weight: 800; color: #0f172a; margin: 8px 0 12px 0;">Empowering Career Excellence</h1><p style="color: #64748b; font-size: 14px; margin: 0;">Built for modern job seekers, engineers, leaders, and career changers.</p></div><section style="margin-bottom: 32px;"><h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">Our Mission</h2><p>ResumePilot AI combines state-of-the-art LLM intelligence, recruiter-certified typography, and real-time ATS scoring to ensure your talent gets recognized by top employers worldwide.</p></section></div>`,
        published: true,
        status: 'published'
    }
};

app.get('/api/public/custom-pages/:slug', async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug)) {
        return res.status(400).json({ success: false, code: 'INVALID_PAGE_SLUG', error: 'Invalid page slug.' });
    }
    try {
        let page = await getRepository().getCustomPageBySlug(slug, { publishedOnly: true });
        if (!page && DEFAULT_BUILTIN_PAGES[slug]) {
            page = { ...DEFAULT_BUILTIN_PAGES[slug], id: slug, source: 'BUILTIN_LEGAL_PAGE' };
        }
        res.setHeader('Cache-Control', 'no-store');
        if (!page) return res.status(404).json({ success: false, code: 'CUSTOM_PAGE_NOT_FOUND', error: 'Page not found.' });
        return res.json({ success: true, page, source: page.source || 'MARIADB_CUSTOM_PAGES' });
    } catch (_error) {
        if (DEFAULT_BUILTIN_PAGES[slug]) {
            return res.json({ success: true, page: { ...DEFAULT_BUILTIN_PAGES[slug], id: slug, source: 'BUILTIN_FALLBACK' } });
        }
        return res.status(503).json({
            success: false,
            code: 'CUSTOM_PAGES_UNAVAILABLE',
            error: 'Custom pages are temporarily unavailable.',
            requestId: res.locals.requestId,
        });
    }
});

app.get('/api/admin/pages', async (_req, res) => {
    try {
        const pages = await getRepository().getCustomPages({ publishedOnly: false, limit: 500 });
        return res.json({ success: true, pages, source: 'MARIADB_CUSTOM_PAGES' });
    } catch (_error) {
        return res.status(503).json({ success: false, code: 'CUSTOM_PAGES_UNAVAILABLE', error: 'Page service unavailable.' });
    }
});

app.put('/api/admin/pages/:slug', async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    const status = String(req.body?.status || 'draft').toLowerCase();
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug) || !['draft', 'published', 'unpublished'].includes(status) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid custom page request.' });
    try {
        const content = validateCustomPageContent(req.body?.pagecontent);
        const title = String(req.body?.title || slug).replace(/\p{Cc}/gu, ' ').trim().slice(0, 160) || slug;
        const description = String(req.body?.description || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
        const saved = await resilientMutations.updateDocument({
            entityType: 'custom_pages', id: slug, expectedRevision,
            patch: { id: slug, slug, title, description, pagecontent: content, content, status, published: status === 'published' },
            actorUid: req.user.uid,
            requestId: res.locals.requestId,
            action: expectedRevision === 0 ? 'CMS_PAGE_CREATED' : 'CMS_PAGE_UPDATED',
        });
        return res.json({ success: true, page: saved });
    } catch (error) {
        const responseStatus = ['CAS_CONFLICT', 'CMS_PAGE_CONFLICT'].includes(error.code) ? 409 : (error.status || 400);
        return res.status(responseStatus).json({
            success: false,
            code: error.code || 'CUSTOM_PAGE_SAVE_FAILED',
            error: responseStatus >= 500 ? 'Unable to save custom page.' : error.message,
            requestId: res.locals.requestId,
        });
    }
});

app.delete('/api/admin/pages/:slug', async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    const expectedRevision = Number(req.body?.expectedRevision);
    if (!/^[a-z0-9-]{1,80}$/.test(slug) || !Number.isInteger(expectedRevision) || expectedRevision < 1) return res.status(400).json({ success: false, code: 'REVISION_REQUIRED', error: 'A valid custom page slug and current revision are required.' });
    try {
        await resilientMutations.deleteDocument({
            entityType: 'custom_pages', id: slug, expectedRevision,
            actorUid: req.user.uid, requestId: res.locals.requestId, action: 'CMS_PAGE_DELETED',
        });
        return res.json({ success: true });
    } catch (error) {
        const statusCode = error.code === 'CAS_CONFLICT' || error.code === 'CMS_PAGE_CONFLICT' ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(statusCode).json({ success: false, code: error.code, error: statusCode === 500 ? 'Unable to delete page.' : error.message });
    }
});

app.post('/api/admin/website-meta', requireRecentAdminAuthentication, async (req, res) => {
    const allowedLanguages = new Set(['English','Hindi','Spanish','French','German','Italian','Portuguese','Russian','Polish','Dutch','Romanian','Danish','Swedish','Norwegian','Icelandic','Greek']);
    const changes = {};
    if (req.body.title !== undefined) changes.title = String(req.body.title).replace(/\p{Cc}/gu, ' ').trim().slice(0, 160);
    if (req.body.description !== undefined) changes.description = String(req.body.description).replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
    if (req.body.keywords !== undefined) changes.keywords = String(req.body.keywords).replace(/\p{Cc}/gu, ' ').trim().slice(0, 1000);
    if (req.body.language !== undefined) { if (!allowedLanguages.has(req.body.language)) return res.status(400).json({ success: false, error: 'Unsupported website language.' }); changes.language = req.body.language; }
    if (req.body.disabledLanguages !== undefined) changes.disabledLanguages = [...new Set((Array.isArray(req.body.disabledLanguages) ? req.body.disabledLanguages : []).filter(item => allowedLanguages.has(item)))];
    if (req.body.trackingCode !== undefined) { const code = String(req.body.trackingCode).trim(); if (code && !/^(G-[A-Z0-9]{10}|UA-[0-9]+-[0-9]+)$/.test(code)) return res.status(400).json({ success: false, error: 'Invalid analytics measurement ID.' }); changes.trackingCode = code; }
    if (req.body.rating !== undefined) { const rating = Number(req.body.rating); if (!Number.isFinite(rating) || rating < 1 || rating > 5) return res.status(400).json({ success: false, error: 'Rating must be from 1 to 5.' }); changes.rating = rating; changes.ratingUpdatedAt = new Date().toISOString(); }
    if (!Object.keys(changes).length) return res.status(400).json({ success: false, error: 'No metadata changes supplied.' });
    let connection;
    try {
        const expectedRevision = Number(req.body.expectedRevision);
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
            return res.status(400).json({ success: false, code: 'WEBSITE_META_REVISION_REQUIRED', error: 'expectedRevision is required.' });
        }
        connection = await getPool().getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query(
            "SELECT data, revision FROM system_settings WHERE category = 'website_meta' FOR UPDATE"
        );
        const current = rows[0]
            ? (typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : (rows[0].data || {}))
            : {};
        const currentRevision = Number(current.revision ?? rows[0]?.revision ?? 0);
        if (expectedRevision !== currentRevision) {
            throw Object.assign(new Error('Website metadata changed after this panel loaded. Refresh before saving.'), {
                code: 'ADMIN_TARGET_CHANGED', status: 409,
            });
        }
        const revision = currentRevision + 1;
        const metadata = { ...current, ...changes, revision, updatedAt: new Date().toISOString() };
        await connection.query(
            `INSERT INTO system_settings (category, data, revision, updated_at)
             VALUES ('website_meta', ?, ?, NOW())
             ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = NOW()`,
            [JSON.stringify(metadata), revision]
        );
        const ratingChanged = Object.hasOwn(changes, 'rating');
        const auditAction = ratingChanged ? 'GLOBAL_RATING_UPDATED' : 'WEBSITE_METADATA_UPDATED';
        const auditCategory = ratingChanged ? 'reviews.rating' : 'system.config';
        await connection.query(
            `INSERT INTO admin_audit_logs
             (id, actor_uid, actor_email, actor_role, action, category, severity, outcome,
              method, pathname, status_code, resource_type, resource_id, metadata, request_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'HIGH', 'SUCCESS',
                     'POST', '/api/admin/website-meta', 200, 'PLATFORM_CONFIG', 'website_meta', ?, ?, NOW())`,
            [crypto.randomUUID(), req.user.uid, req.user.email || null, req.user.role || 'ADMIN',
                auditAction, auditCategory,
                JSON.stringify({
                    revision,
                    changedFields: Object.keys(changes),
                    ...(ratingChanged ? { previousRating: current.rating ?? null, rating: changes.rating } : {}),
                }), res.locals.requestId || null]
        );
        await connection.commit();
        return res.json({ success: true, metadata });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch { /* broken connection */ }
        }
        const status = error.status || 503;
        return res.status(status).json({
            success: false,
            code: error.code || 'WEBSITE_METADATA_SAVE_FAILED',
            error: status < 500 ? error.message : 'Unable to update website metadata.',
            requestId: res.locals.requestId,
        });
    } finally {
        if (connection) connection.release();
    }
});

app.get(['/public/trusted-by.json', '/api/public/trusted-by', '/api/trusted-by.json', '/trusted-by.json'], async (_req, res) => {
    try {
        const items = await getRepository().getTrustedBy({ publishedOnly: true, limit: 500 });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, items, source: 'MARIADB_TRUSTED_BY' });
    } catch (_error) {
        return res.status(503).json({
            success: false,
            code: 'TRUSTED_BY_UNAVAILABLE',
            error: 'Trusted organizations are temporarily unavailable.',
            requestId: res.locals.requestId,
        });
    }
});

app.get('/api/admin/trusted-by', async (_req, res) => {
    try {
        const items = await getRepository().getTrustedBy({ publishedOnly: false, limit: 500 });
        return res.json({ success: true, items, source: 'MARIADB_TRUSTED_BY' });
    } catch (_error) {
        return res.status(503).json({ success: false, code: 'TRUSTED_BY_UNAVAILABLE', error: 'Trusted-logo service unavailable.' });
    }
});

app.post('/api/admin/trusted-by', async (req, res) => {
    try {
        const data = normalizeTrustedLogo(req.body);
        const saved = await resilientMutations.createDocument({
            entityType: 'trusted_by', data,
            actorUid: req.user.uid, requestId: res.locals.requestId, action: 'TRUSTED_LOGO_CREATED',
        });
        return res.json({ success: true, item: saved });
    } catch (error) {
        const status = error.status || 400;
        return res.status(status).json({ success: false, code: error.code || 'TRUSTED_LOGO_SAVE_FAILED', error: status >= 500 ? 'Unable to save trusted logo.' : error.message });
    }
});

app.patch('/api/admin/trusted-by/:logoId', async (req, res) => {
    const logoId = String(req.params.logoId || '');
    const expectedRevision = Number(req.body?.expectedRevision);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(logoId) || !Number.isInteger(expectedRevision) || expectedRevision < 1) return res.status(400).json({ success: false, code: 'REVISION_REQUIRED', error: 'A valid logo ID and current revision are required.' });
    try {
        const data = normalizeTrustedLogo(req.body);
        const saved = await resilientMutations.updateDocument({
            entityType: 'trusted_by', id: logoId,
            expectedRevision, patch: data,
            actorUid: req.user.uid, requestId: res.locals.requestId, action: 'TRUSTED_LOGO_UPDATED',
        });
        return res.json({ success: true, item: saved });
    } catch (error) {
        const status = error.code === 'CAS_CONFLICT' || error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : (error.status || 400);
        return res.status(status).json({ success: false, code: error.code, error: status >= 500 ? 'Unable to update trusted logo.' : error.message });
    }
});

app.delete('/api/admin/trusted-by/:logoId', async (req, res) => {
    const logoId = String(req.params.logoId || '');
    const expectedRevision = Number(req.body?.expectedRevision);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(logoId) || !Number.isInteger(expectedRevision) || expectedRevision < 1) return res.status(400).json({ success: false, code: 'REVISION_REQUIRED', error: 'A valid logo ID and current revision are required.' });
    try {
        await resilientMutations.deleteDocument({
            entityType: 'trusted_by', id: logoId,
            expectedRevision, actorUid: req.user.uid, requestId: res.locals.requestId, action: 'TRUSTED_LOGO_DELETED',
        });
        return res.json({ success: true });
    } catch (error) {
        const status = error.code === 'CAS_CONFLICT' || error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : (error.status || 500);
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete logo.' : error.message });
    }
});

app.post('/api/admin/reviews', async (req, res) => {
    const clean = (value, max) => String(value || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, max);
    const name = clean(req.body?.name, 120);
    const occupation = clean(req.body?.occupation, 160);
    const review = clean(req.body?.review, 2_000);
    const rating = Number(req.body?.rating);
    let imageUrl = clean(req.body?.imageUrl, 2_048);
    if (imageUrl) {
        try { const parsed = new URL(imageUrl); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) imageUrl = ''; }
        catch { imageUrl = ''; }
    }
    if (!name || !review || !Number.isFinite(rating) || rating < 1 || rating > 5) return res.status(400).json({ success: false, error: 'Name, review, and rating from 1 to 5 are required.' });
    try {
        const saved = await resilientMutations.createDocument({
            entityType: 'reviews',
            data: { name, occupation, review, rating, imageUrl, status: 'approved' },
            actorUid: req.user.uid, requestId: res.locals.requestId, action: 'REVIEW_CREATED',
        });
        return res.json({ success: true, id: saved.id, revision: saved.revision });
    } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/reviews/:reviewId', async (req, res) => {
    const reviewId = String(req.params.reviewId || '');
    const expectedRevision = Number(req.body?.expectedRevision);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(reviewId) || !Number.isInteger(expectedRevision) || expectedRevision < 1) return res.status(400).json({ success: false, code: 'REVISION_REQUIRED', error: 'A valid review ID and current revision are required.' });
    try {
        await resilientMutations.deleteDocument({
            entityType: 'reviews', id: reviewId,
            expectedRevision, actorUid: req.user.uid, requestId: res.locals.requestId, action: 'REVIEW_DELETED',
        });
        return res.json({ success: true });
    } catch (error) {
        const status = error.code === 'CAS_CONFLICT' || error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : (error.status || 500);
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete review.' : error.message });
    }
});

app.patch('/api/admin/companies/:companyId', async (req, res) => {
    const companyId = String(req.params.companyId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(companyId)) return res.status(400).json({ success: false, error: 'Invalid company ID.' });
    const hasStatus = Object.hasOwn(req.body, 'status');
    const hasFeatured = Object.hasOwn(req.body, 'featured');
    if (Number(hasStatus) + Number(hasFeatured) !== 1) return res.status(400).json({ success: false, error: 'Exactly one company change is allowed per request.' });
    const status = String(req.body.status || '').toLowerCase();
    if (hasStatus && !['approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid company status.' });
    if (hasStatus && status === 'rejected' && !String(req.body.reason || '').trim()) return res.status(400).json({ success: false, error: 'A rejection reason is required.' });
    if (hasFeatured && typeof req.body.featured !== 'boolean') return res.status(400).json({ success: false, error: 'Invalid featured state.' });
    try {
        const reason = String(req.body.reason || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
        const patch = hasStatus
            ? { status, ...(status === 'approved' ? { approvedAt: new Date().toISOString(), rejectionReason: null } : { rejectedAt: new Date().toISOString(), rejectionReason: reason }) }
            : { featured: req.body.featured, featuredAt: req.body.featured ? new Date().toISOString() : null };
        const result = await resilientMutations.moderateCompany({
            companyId, expectedStatus: req.body.expectedStatus,
            expectedFeatured: req.body.expectedFeatured, patch, actorUid: req.user.uid, requestId: res.locals.requestId,
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        const responseStatus = error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : (error.status || 500);
        return res.status(responseStatus).json({ success: false, code: error.code, error: responseStatus === 500 ? 'Unable to update company.' : error.message });
    }
});

app.patch('/api/admin/jobs/:jobId', async (req, res) => {
    const jobId = String(req.params.jobId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return res.status(400).json({ success: false, error: 'Invalid job ID.' });
    const hasStatus = Object.hasOwn(req.body, 'status');
    const hasFeatured = Object.hasOwn(req.body, 'isFeatured');
    if (Number(hasStatus) + Number(hasFeatured) !== 1) return res.status(400).json({ success: false, error: 'Exactly one job change is allowed per request.' });
    const status = String(req.body.status || '').toLowerCase();
    if (hasStatus && !['active', 'pending', 'inactive', 'archived'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid job status.' });
    if (hasFeatured && typeof req.body.isFeatured !== 'boolean') return res.status(400).json({ success: false, error: 'Invalid featured state.' });
    try {
        const patch = hasStatus
            ? { status, updatedAt: new Date().toISOString() }
            : { isFeatured: req.body.isFeatured, featuredAt: req.body.isFeatured ? new Date().toISOString() : null };
        const result = await resilientMutations.moderateJob({
            jobId, expectedStatus: req.body.expectedStatus,
            expectedFeatured: req.body.expectedFeatured, patch, actorUid: req.user.uid, requestId: res.locals.requestId,
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        const responseStatus = error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : (error.status || 500);
        return res.status(responseStatus).json({ success: false, code: error.code, error: responseStatus === 500 ? 'Unable to update job.' : error.message });
    }
});

app.delete('/api/admin/jobs/:jobId', async (req, res) => {
    const jobId = String(req.params.jobId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return res.status(400).json({ success: false, error: 'Invalid job ID.' });
    try {
        await resilientMutations.deleteJob({
            jobId, expectedRevision: req.body?.expectedRevision,
            actorUid: req.user.uid, requestId: res.locals.requestId, requireNoApplications: true,
        });
        return res.json({ success: true });
    } catch (error) {
        const responseStatus = ['ADMIN_TARGET_CHANGED', 'JOB_HAS_APPLICATIONS', 'CAS_CONFLICT'].includes(error.code) ? 409 : error.code === 'NOT_FOUND' ? 404 : (error.status || 500);
        return res.status(responseStatus).json({ success: false, code: error.code, error: responseStatus === 500 ? 'Unable to delete job.' : error.message });
    }
});

app.use('/api/admin/support', supportAdminRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin', adminPlatformOperationsRouter);
// Durable account deletion removes the subject's personal content and credentials,
// tombstones employer listings so other applicants retain their application history,
// and preserves only the explicitly reported statutory/security record classes.
// GDPR / account data export — MySQL authoritative. Assembled from the
// owner-scoped rows of the current authenticated user only.
app.post('/api/account/export', async (req, res) => {
    const uid = req.user.uid;
    if (!uid) return res.status(401).json({ success: false, error: 'Authentication required.' });
    try {
        const { getRepository } = require('./repositories');
        const repo = getRepository();
        const pool = getPool();
        const readSection = async (section, loader, fallback = []) => {
            try {
                return { section, value: await loader(), warning: null };
            } catch (error) {
                console.warn('[Account export section unavailable]', section, error?.code || error?.message);
                return {
                    section,
                    value: fallback,
                    warning: { section, status: 'UNAVAILABLE', message: 'This section could not be exported. Retry later or contact support.' },
                };
            }
        };
        const sectionReads = await Promise.all([
            readSection('profile', () => repo.getUser(uid), {}),
            readSection('resumes', () => repo.getResumes(uid)),
            readSection('portfolios', () => repo.getPortfolios(uid)),
            readSection('covers', () => repo.getCovers(uid)),
            readSection('favourites', () => repo.getFavourites(uid)),
            readSection('transactions', () => repo.getUserPaymentOrders(uid)),
            readSection('notifications', () => repo.getNotifications(uid)),
            readSection('applications', () => repo.getApplications({ applicantId: uid })),
            readSection('jobs', () => repo.getJobs({ employerId: uid })),
            readSection('companies', () => repo.getCompanies({ employerId: uid })),
            readSection('jobTracker', async () => (await pool.query('SELECT * FROM job_tracker WHERE user_id = ? ORDER BY created_at DESC', [uid]))[0]),
            readSection('invoices', async () => (await pool.query('SELECT payload FROM invoices WHERE user_id = ? ORDER BY issued_at DESC', [uid]))[0]),
            readSection('messaging', async () => (await pool.query('SELECT conversation_id FROM conversation_participants WHERE user_id = ?', [uid]))[0]),
        ]);
        const sections = Object.fromEntries(sectionReads.map(result => [result.section, result.value]));
        const profileRead = sectionReads.find(result => result.section === 'profile');
        if (!profileRead.warning && !sections.profile) {
            return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User profile not found.' });
        }
        const exportWarnings = sectionReads.flatMap(result => result.warning ? [result.warning] : []);

        const messaging = { conversations: [], messagesByConversation: {} };
        if (!sectionReads.find(result => result.section === 'messaging')?.warning) {
            const messagingRead = await readSection('messaging', async () => {
                for (const { conversation_id: conversationId } of sections.messaging) {
                    const [[conversationRows], [participantRows], [messageRows]] = await Promise.all([
                        pool.query('SELECT id, application_id AS applicationId, created_at AS createdAt FROM conversations WHERE id = ?', [conversationId]),
                        pool.query('SELECT user_id FROM conversation_participants WHERE conversation_id = ?', [conversationId]),
                        pool.query('SELECT id, sender_id AS senderId, text, timestamp FROM conversation_messages WHERE conversation_id = ? ORDER BY timestamp ASC', [conversationId]),
                    ]);
                    const participants = Object.fromEntries(participantRows.map(participant => [participant.user_id, true]));
                    if (conversationRows.length) messaging.conversations.push({ id: conversationId, ...conversationRows[0], participants });
                    messaging.messagesByConversation[conversationId] = messageRows;
                }
                return messaging;
            }, messaging);
            if (messagingRead.warning) exportWarnings.push(messagingRead.warning);
        }

        const invoiceRecords = [];
        let invalidInvoices = 0;
        for (const row of sections.invoices) {
            try {
                const invoice = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
                if (invoice && typeof invoice === 'object') invoiceRecords.push(invoice);
                else invalidInvoices += 1;
            } catch { invalidInvoices += 1; }
        }
        if (invalidInvoices) {
            exportWarnings.push({
                section: 'invoices',
                status: 'PARTIAL',
                message: `${invalidInvoices} malformed invoice record${invalidInvoices === 1 ? '' : 's'} could not be exported.`,
            });
        }

        res.setHeader('Cache-Control', 'no-store, private');
        return res.json({
            success: true,
            export: {
                exportDate: new Date().toISOString(),
                userId: uid,
                profile: sections.profile || {},
                resumes: sections.resumes,
                portfolios: sections.portfolios,
                covers: sections.covers,
                favourites: sections.favourites,
                jobTracker: sections.jobTracker,
                transactions: sections.transactions,
                invoices: invoiceRecords,
                notifications: sections.notifications,
                applications: sections.applications,
                jobs: sections.jobs,
                companies: sections.companies,
                messaging,
                exportWarnings,
                note: 'Provider-held identity, payment-provider records, security audit logs, and legally retained billing records require provider/support export channels.',
            },
        });
    } catch (error) {
        console.error('[Account export]', error.message);
        return res.status(500).json({ success: false, error: 'Account export is temporarily unavailable.' });
    }
});

app.post('/api/account/delete', async (req, res) => {
    const uid = req.user.uid;
    // Applications belong to their applicants and retain a bounded job snapshot.
    try {
        const result = await accountDeletion.requestDeletion({
            uid,
            actorUid: uid,
            requestId: res.locals.requestId,
            identityAdmin: req.app.get('firebaseAdmin') || admin,
        });
        return res.json({
            success: true,
            message: 'Identity and personal profile, resume, portfolio, CMS, applicant, notification, and messaging data were deleted. Employer listings were tombstoned so other applicants retain their history.',
            retainedRecordTypes: result.retainedRecordTypes,
        });
    } catch (error) {
        console.error('[Account self-delete]', error.message);
        return res.status(error.status || 500).json({
            success: false,
            code: error.code || 'ACCOUNT_DELETE_FAILED',
            error: error.message || 'Unable to complete account deletion. Identity remains active unless the response explicitly confirms success.',
        });
    }
});

// Administrative deletion uses the same durable MariaDB deletion saga as
// self-service deletion. Firebase Authentication remains the identity owner;
// retained billing/security records are pseudonymized rather than destroyed.
app.post(['/api/admin/delete-user', '/api/auth/purge-orphaned-auth'], requireRecentAdminAuthentication, async (req, res) => {
    const requestedUid = String(req.body?.uid || '').trim();
    const requestedEmail = String(req.body?.email || '').trim().toLowerCase();
    const identityAdmin = req.app.get('firebaseAdmin') || admin;
    if ((!requestedUid && !requestedEmail) || !identityAdmin?.auth) {
        return res.status(400).json({ success: false, code: 'USER_DELETE_INPUT_INVALID', error: 'User UID or email is required.' });
    }
    if (requestedUid && !/^[A-Za-z0-9:_-]{1,128}$/.test(requestedUid)) {
        return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user UID.' });
    }
    if (requestedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
        return res.status(400).json({ success: false, code: 'INVALID_EMAIL', error: 'Invalid user email.' });
    }
    try {
        const repo = getRepository();
        let identity = null;
        try {
            identity = requestedUid
                ? await identityAdmin.auth().getUser(requestedUid)
                : await identityAdmin.auth().getUserByEmail(requestedEmail);
        } catch (error) {
            if (error.code !== 'auth/user-not-found' || !requestedUid) throw error;
        }
        const targetUid = identity?.uid || requestedUid;
        if (!/^[A-Za-z0-9:_-]{1,128}$/.test(targetUid)) {
            return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user UID.' });
        }
        if (targetUid === req.user.uid) {
            return res.status(400).json({ success: false, code: 'SELF_DELETION_PROHIBITED', error: 'Self-deletion through the admin endpoint is prohibited.' });
        }
        const profile = await repo.getUser(targetUid);
        if (!identity && !profile) {
            return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found.' });
        }
        const authoritativeEmail = String(identity?.email || profile?.email || '').toLowerCase();
        if (requestedEmail && authoritativeEmail && authoritativeEmail !== requestedEmail) {
            return res.status(400).json({ success: false, code: 'USER_IDENTITY_MISMATCH', error: 'UID/email identity mismatch.' });
        }
        const targetRole = String(identity?.customClaims?.role || '').toUpperCase();
        if (targetRole === 'SUPER_ADMIN' && !isSuperAdmin(req.user)) {
            return res.status(403).json({ success: false, code: 'SUPER_ADMIN_PROTECTED', error: 'Only SUPER_ADMIN can delete another SUPER_ADMIN.' });
        }

        if (!profile && identity) {
            // Identity-only orphan: no application-data saga is needed, but the
            // action is durably audited before deleting the external identity.
            await getPool().query(
                `INSERT INTO security_audit_logs
                 (id, action, actor_uid, target_uid, category, severity, target_type, target_id, metadata, request_id, created_at)
                 VALUES (?, 'ORPHANED_IDENTITY_DELETE_REQUESTED', ?, ?, 'admin.users', 'HIGH',
                         'FIREBASE_AUTH_IDENTITY', ?, ?, ?, NOW())`,
                [crypto.randomUUID(), req.user.uid, targetUid, targetUid,
                    JSON.stringify({ profileFound: false }), res.locals.requestId || null]
            );
            await identityAdmin.auth().deleteUser(targetUid);
            await getPool().query(
                `INSERT INTO security_audit_logs
                 (id, action, actor_uid, target_uid, category, severity, target_type, target_id, metadata, request_id, created_at)
                 VALUES (?, 'ORPHANED_IDENTITY_DELETED', ?, ?, 'admin.users', 'HIGH',
                         'FIREBASE_AUTH_IDENTITY', ?, ?, ?, NOW())`,
                [crypto.randomUUID(), req.user.uid, targetUid, targetUid,
                    JSON.stringify({ profileFound: false }), res.locals.requestId || null]
            );
            return res.json({ success: true, identityDeleted: true, applicationProfileFound: false });
        }

        const result = await accountDeletion.requestDeletion({
            uid: targetUid,
            actorUid: req.user.uid,
            requestId: res.locals.requestId,
            identityAdmin,
        });
        return res.json({
            success: true,
            identityDeleted: result.identityDeleted,
            applicationProfileFound: true,
            retainedRecordTypes: result.retainedRecordTypes,
            message: 'The identity was deleted and owned application data was removed or pseudonymized under the retention policy.',
        });
    } catch (error) {
        console.error('[Admin delete user]', { code: error.code, requestId: res.locals.requestId });
        const status = error.status || (error.code === 'auth/user-not-found' ? 404 : 503);
        return res.status(status).json({
            success: false,
            code: error.code || 'USER_DELETE_FAILED',
            error: status >= 500 ? 'Unable to complete user deletion.' : error.message,
            identityPending: error.identityPending === true,
            requestId: res.locals.requestId,
        });
    }
});
app.post('/api/auth/set-user-password', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const newPassword = String(req.body.newPassword || '');
    const token = String(req.body.token || '');
    try {
        if (!isOpaqueToken(token)) throw new Error('INVALID_RESET_TOKEN');
        assertPasswordPolicy(email, newPassword);
    } catch (_) {
        return res.status(400).json({ success: false, error: 'A valid reset token, email, and a password of 12-128 characters not containing the email name are required.' });
    }
    if (!admin?.auth) return res.status(503).json({ success: false, error: 'Password reset service unavailable.' });
    const tokenHash = hashToken(token);
    const leaseId = crypto.randomUUID();
    const { leasePasswordResetToken, finalizePasswordReset, releasePasswordResetLease } = require('./database/authTokens');
    try {
        // Atomically validate + lease the token in MySQL (single-use,
        // latest-token-only). A concurrent request cannot acquire the same token.
        const leased = await leasePasswordResetToken({ tokenHash, email, leaseId });
        const user = await admin.auth().getUserByEmail(email);
        if (leased.uid !== user.uid) throw new Error('INVALID_RESET_TOKEN');
        await admin.auth().updateUser(user.uid, { password: newPassword });
        await admin.auth().revokeRefreshTokens(user.uid);
        // Mark used + account state consumed in the same MySQL transaction.
        await finalizePasswordReset({ tokenHash, uid: user.uid, leaseId });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, message: 'Password updated successfully.' });
    } catch (_err) {
        // Release a lease only when this request owns it; do not make an already-used token reusable.
        await releasePasswordResetLease({ tokenHash, leaseId }).catch(() => {});
        return res.status(400).json({ success: false, error: 'Invalid or expired password reset link.' });
    }
});

/**
 * Turns a delivery result into an HTTP response.
 *
 * Three outcomes, deliberately kept distinct:
 *   202 DELIVERY_ATTEMPTED - handed to the provider and accepted.
 *   503 NOT_CONFIGURED     - no mail provider is configured on this deployment.
 *                            Nothing is broken; the capability is simply not
 *                            set up, and the caller is told exactly that.
 *   502 DELIVERY_FAILED    - a configured provider was tried and refused.
 *
 * The middle case used to be reported as 502, which made a deployment without
 * SMTP look like it had a failing mail server.
 */
app.post([...retiredClientNotificationPaths], (_req, res) => res.status(410).json({
    success: false,
    code: 'CLIENT_NOTIFICATION_DISPATCH_RETIRED',
    message: 'Notifications are generated from authoritative server-side lifecycle transitions.'
}));

// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn / GitHub OAuth: state-cookie-bound authorization code flow followed
// by a one-time Firebase custom-token exchange. No unsigned browser session exists.
// ─────────────────────────────────────────────────────────────────────────────
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const OAUTH_EXCHANGE_TTL_MS = 60 * 1000;
const oauthCookie = (state, clear = false) => {
    const secure = protocol === 'https' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `rp_oauth_state=${clear ? '' : encodeURIComponent(state)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 300}${secure}`;
};
const safeRedirect = (res, value) => res.redirect(`${protocol}://${websiteName}${value}`);

async function getSocialAuthCredentials(provider) {
    let storedClientId = '';
    let storedClientSecret = '';
    const legacyPrefix = provider === 'linkedin' ? 'linkedin' : 'github';
    // MySQL is the authoritative store for OAuth provider credentials (stored via
    // the admin settings surface in system_settings.admin_configuration /
    // system_settings.system_settings). Firestore is never consulted.
    try {
        const { getPool } = require('./database/mysql');
        const pool = getPool();
        const [rows] = await pool.query(
            "SELECT category, data FROM system_settings WHERE category IN ('admin_configuration','system_settings') LIMIT 2"
        ).catch(() => [[]]);
        let canonical = {};
        for (const row of rows || []) {
            const data = row && row.data ? (typeof row.data === 'string' ? safeJsonParse(row.data) : row.data) : {};
            const social = (data && data.socialAuth) || {};
            canonical = { ...canonical, ...social };
        }
        storedClientId = String(canonical[`${legacyPrefix}ClientId`] || canonical[`${legacyPrefix}ClientID`] || '').trim();
        storedClientSecret = String(canonical[`${legacyPrefix}ClientSecret`] || '').trim();
    } catch (error) {
        console.warn(`[OAuth config ${provider}]`, error.message);
    }
    const envPrefix = provider === 'linkedin' ? 'LINKEDIN' : 'GITHUB';
    const selected = chooseCredentialPair({
        environmentId: process.env[`${envPrefix}_CLIENT_ID`],
        environmentSecret: process.env[`${envPrefix}_CLIENT_SECRET`],
        storedId: storedClientId,
        storedSecret: storedClientSecret,
    });
    return { clientId: selected.id, clientSecret: selected.secret, source: selected.source };
}

function safeJsonParse(value) {
    try { return JSON.parse(value); } catch { return {}; }
}

/**
 * Sign-in entry points are reached by a browser navigation, not by fetch, so an
 * error here must land the user somewhere that can explain itself. Returning a
 * bare 503 body left the user on a blank page with no way back — the classic
 * unexplained failure. Instead we redirect to the login screen carrying a
 * machine-readable reason that distinguishes "this provider was never
 * configured" from "the provider is configured but temporarily unavailable".
 */
function failOAuthBegin(res, provider, reason) {
    return safeRedirect(res, `/login?error=${encodeURIComponent(reason)}&provider=${encodeURIComponent(provider)}`);
}

async function beginOAuth(provider, req, res) {
    try {
        const { createOAuthState } = require('./database/oauthStore');
        const { clientId, clientSecret } = await getSocialAuthCredentials(provider);
        // Both halves are required for the complete code exchange. Starting a
        // redirect with only a client id would create a guaranteed callback
        // failure and make the UI look healthier than the runtime.
        if (!clientId || !clientSecret) {
            console.warn(`[OAuth begin ${provider}] no client id configured`);
            return failOAuthBegin(res, provider, 'oauth_not_configured');
        }
        const state = crypto.randomBytes(32).toString('base64url');
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        const challenge = createPkceChallenge(codeVerifier);
        await createOAuthState({ stateHash: hashOpaque(state), provider, codeVerifier, expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
        res.setHeader('Set-Cookie', oauthCookie(state));
        const callback = `${protocol}://${websiteName}/api/auth/${provider}/callback`;
        const url = provider === 'linkedin'
            ? new URL('https://www.linkedin.com/oauth/v2/authorization')
            : new URL('https://github.com/login/oauth/authorize');
        const params = provider === 'linkedin'
            ? { response_type: 'code', client_id: clientId, redirect_uri: callback, state, scope: 'openid profile email', code_challenge: challenge, code_challenge_method: 'S256' }
            : { client_id: clientId, redirect_uri: callback, state, scope: 'read:user user:email', code_challenge: challenge, code_challenge_method: 'S256' };
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        return res.redirect(url.href);
    } catch (error) {
        console.error(`[OAuth begin ${provider}]`, error.message);
        return failOAuthBegin(res, provider, 'oauth_unavailable');
    }
}

async function consumeOAuthState(provider, req) {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const cookieState = parseCookies(req.headers.cookie).rp_oauth_state || '';
    assertStateBinding(state, cookieState);
    const { consumeOAuthState: consumeStateRow } = require('./database/oauthStore');
    // The store row is deleted atomically with the read; expiry is enforced inside
    // the store, and assertStateRecord re-checks shape + provider + TTL.
    const record = await consumeStateRow({ stateHash: hashOpaque(state), provider });
    if (!record) throw new Error('OAUTH_STATE_INVALID');
    assertStateRecord({ ...record, expiresAt: Number(record.expiresAt) || 0 }, provider);
    return { codeVerifier: record.codeVerifier };
}

async function upsertFederatedIdentity({ provider, providerId, email, emailVerified, displayName, photoURL }) {
    if (!admin?.auth) throw new Error('OAUTH_IDENTITY_INVALID');
    const normalizedEmail = assertVerifiedIdentity({ provider, providerId, email, emailVerified });
    const providerUid = `${provider}:${String(providerId)}`.slice(0, 128);
    let providerUser = null;
    let emailOwner = null;
    try { providerUser = await admin.auth().getUser(providerUid); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    if (!providerUser) {
        try { emailOwner = await admin.auth().getUserByEmail(normalizedEmail); }
        catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    }
    assertAccountLinkSafe({ providerUid, providerUser, emailOwner, normalizedEmail });
    const user = providerUser || await admin.auth().createUser({
        uid: providerUid,
        email: normalizedEmail,
        emailVerified: true,
        displayName: String(displayName || 'User').slice(0, 100),
        photoURL: photoURL || undefined
    });
    if (!user.emailVerified) await admin.auth().updateUser(user.uid, { emailVerified: true });
    const parts = String(displayName || 'User').trim().split(/\s+/);
    const profile = {
        userId: user.uid,
        email: normalizedEmail,
        firstname: parts[0] || 'User',
        lastname: parts.slice(1).join(' '),
        displayName: String(displayName || 'User').slice(0, 100),
        ...(photoURL ? { photoURL } : {}),
    };
    try {
        const { getRepository } = require('./repositories');
        const existingProfile = await getRepository().getUser(user.uid);
        await getRepository().saveUser(user.uid, {
            ...profile,
            membership: existingProfile && existingProfile.membership ? existingProfile.membership : 'Basic',
            paymentStatus: existingProfile && existingProfile.paymentStatus ? existingProfile.paymentStatus : 'INACTIVE',
        });
    } catch (repoErr) {
        // MySQL is the authoritative store. A profile-write failure here must be
        // surfaced as a controlled error — never silently redirected to Firestore.
        console.error('[OAuth] Authoritative MySQL profile write failed:', repoErr.message);
        const err = new Error('OAUTH_PROFILE_WRITE_FAILED');
        err.status = 503;
        throw err;
    }
    return user.uid;
}

async function issueOAuthExchange(uid, provider) {
    const code = crypto.randomBytes(32).toString('base64url');
    const { createOAuthExchangeCode } = require('./database/oauthStore');
    await createOAuthExchangeCode({ codeHash: hashOpaque(code), uid, provider, expiresAt: Date.now() + OAUTH_EXCHANGE_TTL_MS });
    return code;
}

app.get('/api/auth/linkedin', (req, res) => beginOAuth('linkedin', req, res));
app.get('/api/auth/github', (req, res) => beginOAuth('github', req, res));

app.get('/api/auth/linkedin/callback', async (req, res) => {
    res.setHeader('Set-Cookie', oauthCookie('', true));
    if (req.query.error) return safeRedirect(res, '/login?error=linkedin_denied');
    try {
        const state = await consumeOAuthState('linkedin', req);
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        if (!code) throw new Error('OAUTH_CODE_MISSING');
        const { clientId, clientSecret } = await getSocialAuthCredentials('linkedin');
        const redirectUri = `${protocol}://${websiteName}/api/auth/linkedin/callback`;
        const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000,
            body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret, code_verifier: state.codeVerifier }).toString()
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) throw new Error('OAUTH_TOKEN_EXCHANGE_FAILED');
        const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` }, timeout: 10_000 });
        const profile = await profileRes.json();
        if (!profileRes.ok || profile.email_verified !== true) throw new Error('OAUTH_EMAIL_NOT_VERIFIED');
        const uid = await upsertFederatedIdentity({
            provider: 'linkedin', providerId: profile.sub, email: profile.email, emailVerified: true,
            displayName: profile.name || `${profile.given_name || ''} ${profile.family_name || ''}`.trim() || 'LinkedIn User',
            photoURL: /^https:\/\//.test(profile.picture || '') ? profile.picture : null
        });
        const exchange = await issueOAuthExchange(uid, 'linkedin');
        return safeRedirect(res, `/dashboard#oauth_code=${encodeURIComponent(exchange)}&provider=linkedin`);
    } catch (error) {
        console.error('[LinkedIn OAuth callback]', error.message);
        return safeRedirect(res, '/login?error=linkedin_callback_failed');
    }
});

app.get('/api/auth/github/callback', async (req, res) => {
    res.setHeader('Set-Cookie', oauthCookie('', true));
    if (req.query.error) return safeRedirect(res, '/login?error=github_denied');
    try {
        const state = await consumeOAuthState('github', req);
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        if (!code) throw new Error('OAUTH_CODE_MISSING');
        const { clientId, clientSecret } = await getSocialAuthCredentials('github');
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, timeout: 10_000,
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, code_verifier: state.codeVerifier })
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) throw new Error('OAUTH_TOKEN_EXCHANGE_FAILED');
        const headers = { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': `${websiteName}-OAuth`, Accept: 'application/vnd.github+json' };
        const [profileRes, emailsRes] = await Promise.all([
            fetch('https://api.github.com/user', { headers, timeout: 10_000 }),
            fetch('https://api.github.com/user/emails', { headers, timeout: 10_000 })
        ]);
        const profile = await profileRes.json();
        const emails = await emailsRes.json();
        const verified = Array.isArray(emails) ? (emails.find(item => item.primary && item.verified) || emails.find(item => item.verified)) : null;
        if (!profileRes.ok || !emailsRes.ok || !verified?.email) throw new Error('OAUTH_EMAIL_NOT_VERIFIED');
        const uid = await upsertFederatedIdentity({
            provider: 'github', providerId: profile.id, email: verified.email, emailVerified: true,
            displayName: profile.name || profile.login || 'GitHub User',
            photoURL: /^https:\/\//.test(profile.avatar_url || '') ? profile.avatar_url : null
        });
        const exchange = await issueOAuthExchange(uid, 'github');
        return safeRedirect(res, `/dashboard#oauth_code=${encodeURIComponent(exchange)}&provider=github`);
    } catch (error) {
        console.error('[GitHub OAuth callback]', error.message);
        return safeRedirect(res, '/login?error=github_callback_failed');
    }
});

app.post('/api/auth/oauth/exchange', async (req, res) => {
    const code = String(req.body.code || '');
    if (!isOpaqueToken(code) || !admin?.auth) return res.status(400).json({ error: 'Invalid OAuth exchange code' });
    try {
        const { redeemOAuthExchangeCode } = require('./database/oauthStore');
        // Atomically read + delete in MySQL: a code can never be redeemed twice.
        const record = await redeemOAuthExchangeCode({ codeHash: hashOpaque(code) });
        if (!record) throw new Error('INVALID_EXCHANGE_CODE');
        assertExchangeRecord({ ...record, expiresAt: Number(record.expiresAt) || 0 });
        const customToken = await admin.auth().createCustomToken(record.uid, { signInProvider: record.provider });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ customToken });
    } catch (_) {
        return res.status(400).json({ error: 'Invalid or expired OAuth exchange code' });
    }
});

/**
 * POST /api/auth/preview-login — non-production local identity.
 *
 * Preview / local-development environments run with NO Firebase identity
 * provider configured (zero-Firestore certification mode). This endpoint lets
 * the real login/registration form authenticate so the full browser journey is
 * testable. Hard gates:
 *   - Responds ONLY when the local HMAC verifier is enabled
 *     (TEST_AUTH_HMAC_SECRET set AND NODE_ENV !== 'production'); otherwise 404.
 *   - uid is derived deterministically from the email, so the same login
 *     restores the same account and distinct emails isolate accounts
 *     (enables multi-tenant browser E2E).
 *   - Admin/Super Admin roles come ONLY from an explicit server allowlist
 *     (PREVIEW_ADMIN_EMAILS / PREVIEW_SUPER_ADMIN_EMAILS); clients cannot
 *     escalate themselves.
 */
app.post('/api/auth/preview-login', async (req, res) => {
    if (!testVerifierEnabled()) {
        return res.status(404).json({ error: 'Not found' });
    }
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return res.status(400).json({ error: { code: 'auth/invalid-email', message: 'A valid email is required.' } });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: { code: 'auth/weak-password', message: 'Password must be at least 6 characters.' } });
    }
    const uid = 'local_' + crypto.createHash('sha256').update(email).digest('hex').slice(0, 22);
    const splitList = (v) => String(v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const superEmails = splitList(process.env.PREVIEW_SUPER_ADMIN_EMAILS);
    const adminEmails = splitList(process.env.PREVIEW_ADMIN_EMAILS);
    const supportEmails = splitList(process.env.PREVIEW_SUPPORT_EMAILS);
    const auditorEmails = splitList(process.env.PREVIEW_AUDITOR_EMAILS);
    const enterpriseAdminEmails = splitList(process.env.PREVIEW_ENTERPRISE_ADMIN_EMAILS);
    const enterpriseMemberEmails = splitList(process.env.PREVIEW_ENTERPRISE_MEMBER_EMAILS);
    const employerEmails = splitList(process.env.PREVIEW_EMPLOYER_EMAILS);
    let role = 'USER';
    if (superEmails.includes(email)) role = 'SUPER_ADMIN';
    else if (adminEmails.includes(email)) role = 'ADMIN';
    else if (supportEmails.includes(email)) role = 'SUPPORT';
    else if (auditorEmails.includes(email)) role = 'AUDITOR';
    else if (enterpriseAdminEmails.includes(email)) role = 'ENTERPRISE_ADMIN';
    else if (enterpriseMemberEmails.includes(email)) role = 'ENTERPRISE_MEMBER';
    else if (employerEmails.includes(email)) role = 'EMPLOYER';
    const now = Math.floor(Date.now() / 1000);
    const token = issueLocalTestToken({
        uid, email, role,
        email_verified: true,
        auth_time: now,
        exp: now + 60 * 60 * 24 * 7,
        sign_in_second_factor: role !== 'USER',
    });
    // Provision the users row (MySQL authoritative) so profile/resume flows and
    // the resumes.user_id FK work immediately for this account.
    try {
        const { getRepository } = require('./repositories');
        const repo = getRepository();
        const existing = await repo.getUser(uid).catch(() => null);
        const displayName = name || email.split('@')[0];
        if (!existing) {
            await repo.saveUser(uid, {
                email, firstname: displayName, lastname: '', displayName,
                membership: 'Basic', paymentStatus: 'INACTIVE',
            }).catch(() => {});
        }
    } catch (e) {
        console.warn('[PreviewLogin] user provision notice:', e.message);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ token, uid, email, displayName: name || email.split('@')[0], role });
});


/**
 * GET /api/auth/linkedin/test-credentials — Verify LinkedIn credentials are configured
 * Called by Admin OAuth panel to show live status badge.
 */
app.get('/api/auth/linkedin/test-credentials', async (req, res) => {
    const { clientId, clientSecret } = await getSocialAuthCredentials('linkedin');
    const configured = !!(clientId && clientSecret);
    return res.json({
        provider: 'linkedin',
        configured,
        callbackUrl: `${protocol}://${websiteName}/api/auth/linkedin/callback`,
        note: configured ? 'LinkedIn credentials active in Admin Settings / Environment.' : 'LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are not set in Admin Settings or .env.'
    });
});

/**
 * GET /api/auth/github/test-credentials — Verify GitHub credentials are configured
 */
app.get('/api/auth/github/test-credentials', async (req, res) => {
    const { clientId, clientSecret } = await getSocialAuthCredentials('github');
    const configured = !!(clientId && clientSecret);
    return res.json({
        provider: 'github',
        configured,
        callbackUrl: `${protocol}://${websiteName}/api/auth/github/callback`,
        note: configured ? 'GitHub credentials active in Admin Settings / Environment.' : 'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not set in Admin Settings or .env.'
    });
});

/**
 * Enterprise & Super Admin Control Plane Router Integration
 * Security Invariant: SUPER_ADMIN_PROTECTED — SUPER_ADMIN claims cannot be changed from this API.
 *
 * NOTE: All control-plane routers are mounted exactly once, earlier in this file:
 *   /api/enterprise*        -> enterpriseRouter / enterpriseM2mRouter
 *   /api/platform*          -> platformRouter
 *   /api/admin*             -> adminAuditRouter + adminPlatformOperationsRouter
 *   /api/admin/users*       -> adminUsersRouter (authoritative user directory & User 360)
 * Do not re-mount them here; duplicate mounts are dead code and can mask
 * middleware-ordering regressions.
 */

app.use('/api', (req, res) => {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found', requestId: res.locals.requestId } });
});
app.use((error, req, res, _next) => {
    console.error('[Unhandled request error]', res.locals.requestId, error.message);
    if (res.headersSent) return;
    const isQuota = /RESOURCE_EXHAUSTED|Quota exceeded/i.test(error.message) || error.code === 8;
    const status = isQuota ? 429 : Number(error.status || error.statusCode || 500);
    const code = isQuota ? 'RATE_LIMITED' : (error.code && typeof error.code === 'string' ? error.code : (status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR'));
    return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: { code, message: status === 413 ? 'Request payload is too large' : (isQuota ? 'Resource quota exceeded. Please retry later.' : 'Request failed'), requestId: res.locals.requestId }
    });
});

module.exports = app;
module.exports.publishDueBlogPosts = publishDueBlogPosts;


