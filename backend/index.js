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
const { createLogger } = require('./services/logger');
const logger = createLogger({ module: 'backend' });
const EmailNotifier = require('./services/emailNotifier');
const { processOutboxOnce } = require('./services/notificationOutbox');
const { createResumeDocx, resolveExportTemplate } = require('./services/docxExport');
const { loadProviderConfiguration, generateWithProviders } = require('./services/aiRuntime');
const { loadAiAdminSettings, saveAiAdminSettings, testAiProvider, fetchProviderModels } = require('./services/aiAdmin');
const { getGlobalAiDashboardData, setGlobalAiQuotaLimits, resetUserAiQuota, resetAllAiQuota } = require('./services/adminAiEntitlement');
const { mergeAdminSettingCategory } = require('./services/adminSettingsMerge');
const { PAYMENT_PROVIDERS, resolveWriteOnlySecret, getPaymentSettingsProjection } = require('./services/paymentAdmin');
const { resolveEffectiveEntitlement, isPaidMembershipTier } = require('./security/entitlements');
const { chooseCredentialPair, readPersistedPaymentProviders, paypalConfig: paypalConfigShared, getRazorpayKeys: getRazorpayKeysShared, getPaytmConfig: getPaytmConfigShared, getPhonePeConfig: getPhonePeConfigShared } = require('./helpers/payment-providers');
// Bound wrappers: the shared helpers take getRepository as a parameter,
// but existing call sites expect zero-argument functions.
const paypalConfig = () => paypalConfigShared(getRepository);
const getRazorpayKeys = () => getRazorpayKeysShared(getRepository);
const getPaytmConfig = () => getPaytmConfigShared(getRepository);
const getPhonePeConfig = () => getPhonePeConfigShared(getRepository);
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
const { messagingRouter } = require('./routes/messaging');
const { createHealthRouter } = require('./routes/health');
const { createExportRouter } = require('./routes/exports');
const { createOAuthRouter } = require('./routes/oauth');
const { createEmployerRouter } = require('./routes/employer');
const { createPaymentRouter } = require('./routes/payments');
const { createMiscRouter } = require('./routes/misc');
const { getRepository } = require('./repositories');

// Resolve deployment commit SHA (moved earlier for health router dependency)
let globalCommitSha = process.env.COMMIT_SHA;
try {
  const shaPath = path.join(__dirname, 'COMMIT_SHA');
  if (fs.existsSync(shaPath)) {
    const bytes = fs.readFileSync(shaPath);
    const decoded = bytes[0] === 0xff && bytes[1] === 0xfe
      ? bytes.toString('utf16le')
      : bytes.toString('utf8');
    const candidate = decoded.replace(/^\uFEFF/, '').trim();
    if (/^[0-9a-f]{40}$/i.test(candidate)) globalCommitSha = candidate;
  }
} catch (_) {}
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
const configuredWebsiteName = String(process.env.WEBSITE_NAME || 'airesume.projectdemo.guru').trim().toLowerCase();
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
            logger.info('[Firebase Admin] Initialized via environment variables (identity only)');
        } else if (process.env.NODE_ENV === 'production' || process.env.FIREBASE_USE_ADC === 'true' || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            // Workload Identity / Application Default Credentials avoid long-lived key files.
            credential = admin.credential.applicationDefault();
            logger.info('[Firebase Admin] Initialized via Application Default Credentials (identity only)');
        } else {
            // Local builds without credentials can serve non-Firebase diagnostics only.
            admin.initializeApp({ projectId });
            logger.info('[Firebase Admin] Initialized without credentials (limited local mode)');
        }

        if (credential) {
            admin.initializeApp({ credential, projectId });
        }
    }
} catch (e) {
    logger.warn('[Firebase Admin] Initialization notice:', { error: e.message });
}
// The Firebase Admin runtime is exposed only for identity verification and
// identity lifecycle operations; it is not an application-data adapter.
app.set('firebaseAdmin', admin);
// The enterprise control plane is authoritative over MariaDB.
app.set('tenantService', createTenantService({ pool: getPool(), admin }));

// Truthful one-time architecture statement. Never logs secrets or URLs.
if (enterpriseFeatureEnabled()) {
    const runtime = app.get('tenantService')?.describeRuntime?.() || {};
    logger.info('[Enterprise Architecture]', {
        enterpriseTenancy: 'ENABLED',
        dataProvider: `Enterprise Data Provider: ${String(runtime.dataProvider || 'mysql')}`,
        dataPlaneConfigured: runtime.dataPlaneConfigured === true,
        cache: 'Cache: none (MySQL/MariaDB is the authoritative store)',
        queue: 'Queue: MariaDB transactional outbox',
        encryption: `Encryption Provider: ${String(runtime.encryption?.provider === 'server-key' ? 'ServerKey' : runtime.encryption?.provider || 'none')}`,
        encryptionSecurityLevel: runtime.encryption?.securityLevel || null,
        quotaStore: runtime.quotaStore || 'mysql-atomic',
    });
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
                logger.info('[Fonts] Auto-synced template font files to Linux system font cache.');
                try {
                    require('child_process').execSync(`fc-cache -f "${targetDir}"`, { stdio: 'ignore' });
                } catch (_e) {}
            }
        }
    } catch (err) {
        logger.warn('[Fonts] Auto-sync notice:', { error: err.message });
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
        schemaState = { success: false, error: conn.error || 'MySQL unreachable at startup' };
        logger.warn('[Startup] MySQL unreachable — starting in degraded mode:', { error: schemaState.error });
        return schemaState;
    }
    schemaState = await initializeSchema();
    if (!schemaState.success) logger.warn('[Startup] Schema bootstrap incomplete:', { error: schemaState.error });
    return schemaState;
}
app.set('schemaState', () => schemaState);

// Graceful shutdown (§25/§28): drain the HTTP server, close the MariaDB pool,
// then exit. No acknowledged transaction is dropped by the shutdown itself:
// pool shutdown waits for in-flight queries.
let httpServer = null;
// Graceful shutdown is registered inside the require.main === module block below.
// The module-level function was removed to avoid duplicate SIGTERM/SIGINT handlers.

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
    'https://airesume.projectdemo.guru',
    ...configuredOrigins,
    ...(process.env.NODE_ENV === 'production' ? [] : [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://ai-resume-builder.local',
        'https://ai-resume-builder.local'
    ])
]);
app.use(cors({
    origin(origin, callback) {
        // Non-browser clients do not send Origin. Browser origins must be exact allowlist matches.
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
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
    '/healthz', '/readyz', '/health', '/health/databases', '/health/ai-providers', '/health/export-concurrency', '/service-availability', '/platform/version', '/platform/public-config',
    '/enterprise/status',
    '/stripe-webhook', '/public-export', '/export-render-data', '/contact', '/auth/custom-password-reset',
    '/auth/verify-email-token', '/auth/set-user-password', '/auth/linkedin', '/auth/linkedin/callback',
    '/auth/github', '/auth/github/callback', '/auth/oauth/exchange', '/auth/preview-login',
    '/public/custom-pages', '/public/custom-pages.json',
    '/public/trusted-by', '/public/trusted-by.json', '/public/featured-companies',
    '/custom-pages', '/custom-pages.json',
    '/trusted-by', '/trusted-by.json',
    '/blog-data', '/jobs-data',
    '/paytm/callback', '/phonepe/callback',
    // Retired endpoints (410/501) — no auth needed
    '/invoice', '/jobs/naukri',
    '/subscription/preferences', '/payment/razorpay-order',
    // Simple public endpoints
    '/llms.txt',
    // Public read surfaces (MySQL-backed); mutating variants still require auth.
    '/stats', '/reviews', '/phrases', '/portfolios/public'
]);
function isPublicApiPath(pathname) {
    if (pathname.startsWith('/jobs-data/tracker')) return false;
    return publicApiPaths.has(pathname)
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
app.use('/api', miscDataRouter);
app.use('/api/admin/database-settings', databaseAdminRouter);
app.use('/api', messagingRouter);

// Mount health/readiness/observability routes (extracted from inline handlers)
const healthRouter = createHealthRouter({
    databaseAuthority,
    getPool,
    testMysql,
    getSchemaState: () => app.get('schemaState')(),
    getTenantService: () => app.get('tenantService'),
    maybeQueueReadyzAlert,
    getExportStatus: require('./services/exportSemaphore').getExportStatus,
    admin,
    globalCommitSha,
});
app.use('/api', healthRouter);
app.use('/', healthRouter); // /healthz and /readyz at root level

// Mount export routes (extracted from inline handlers)
const exportRouter = createExportRouter({
    getRepository,
    consumeExportRenderToken,
    discardExportRenderToken,
    createExportRenderToken,
    acquireSlot: require('./services/exportSemaphore').acquireSlot,
    releaseSlot: require('./services/exportSemaphore').releaseSlot,
    chromium,
    resolveExportTemplate,
    createResumeDocx,
    resolveEffectiveEntitlement,
    isMembershipActive,
    isPaidMembershipTier,
    toCanonicalUser,
    protocol,
    websiteName,
    logger,
});
app.use('/api', exportRouter);

// Mount OAuth routes (extracted from inline handlers)
const oauthRouter = createOAuthRouter({
    admin,
    protocol,
    websiteName,
    getRepository,
    chooseCredentialPair,
    oauthSecurity: { hashOpaque, createPkceChallenge, parseCookies, assertStateBinding, assertStateRecord, assertVerifiedIdentity, assertAccountLinkSafe, assertExchangeRecord },
    resetSecurity: { isOpaqueToken },
});
app.use('/api', oauthRouter);

// Mount employer/job routes (extracted from inline handlers)
const employerRouter = createEmployerRouter({
    resilientMutations,
    getRepository,
    safePublicUrl,
    adminIso,
    logger,
});
app.use('/api', employerRouter);

// Webhook signature verification does not call the Stripe API. Provider API
// operations resolve the complete authoritative credential at call time so an
// Admin-managed MariaDB secret and a deployment-managed secret behave alike.
const Stripe = require('stripe');
const stripeWebhookVerifier = Stripe(process.env.STRIPE_SECRET || 'webhook-verification-only');

// Mount payment routes (extracted from inline handlers)
const paymentRouter = createPaymentRouter({
    paymentActivation,
    indianGatewayActivation,
    stripeWebhookVerifier,
    getStripeClient,
    reconcileStripeChargeRefund,
    validateStripePaymentIntent,
    validatePayPalOrder,
    validateRazorpaySignature,
    validateRazorpayPayment,
    validatePaytmPayment,
    validatePhonePePayment,
    assertInternalOrder,
    billingSnapshotHash,
    generateInvoice,
    getInvoiceForUser,
    listInvoicesForUser,
    normalizeCustomerDetails,
    supplierFromPublicConfig,
    toCanonicalDate,
    toCanonicalUser,
    isMembershipActive,
    isPaidMembershipTier,
    getRepository,
    logger,
    fetch,
    Stripe,
    PAYMENT_PROVIDERS,
    protocol,
    websiteName,
});
app.use('/api', paymentRouter);

// Mount misc routes (extracted from inline handlers)
const miscRouter = createMiscRouter({
    getRepository,
    normalizeLlmDiscoverySettings,
    loadTwilioRuntimeConfig,
    requireRecentAdminAuthentication,
    logger,
    fetch,
});
app.use('/api', miscRouter);
// Root mount for llms.txt only (specification requires root path)
app.get('/llms.txt', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const publicConfig = await getRepository().getSetting('public_config');
        const llmGeo = normalizeLlmDiscoverySettings(publicConfig?.llmGeo || {});
        if (!llmGeo.enableLlmGeo || !llmGeo.llmsTxtContent) {
            return res.status(404).type('text/plain').send('LLM discovery metadata is not published.\n');
        }
        return res.type('text/plain').send(`${llmGeo.llmsTxtContent}\n`);
    } catch (error) {
        console.error('[llms.txt]', { code: error.code, requestId: res.locals.requestId });
        return res.status(503).type('text/plain').send('LLM discovery metadata is unavailable.\n');
    }
});

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

// stripeWebhookVerifier moved before payment router mount

// Payment provider helpers — still needed by admin refund routes
async function getStripeClient() {
    const environmentSecret = String(process.env.STRIPE_SECRET || '').trim();
    if (environmentSecret) return Stripe(environmentSecret);
    const repo = getRepository();
    const [providers, publicRoot] = await Promise.all([repo.getSetting('payment_providers'), repo.getSetting('public_config')]);
    if (!publicRoot || typeof publicRoot !== 'object' || !publicRoot.subscriptions || typeof publicRoot.subscriptions !== 'object') throw Object.assign(new Error('PAYMENT_CONFIGURATION_UNAVAILABLE'), { status: 503 });
    const storedSecret = String(providers?.stripe?.secretKey || '').trim();
    if (!storedSecret) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { code: 'PAYMENT_PROVIDER_UNAVAILABLE', status: 503 });
    return Stripe(storedSecret);
}

async function paypalAccessToken(baseUrl, clientId, clientSecret) {
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, { method: 'POST', headers: { 'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', timeout: 10_000 });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) throw Object.assign(new Error('PAYPAL_AUTH_FAILED'), { status: 502 });
    return tokenData.access_token;
}

// Payment history is read directly from the owner-bound MariaDB ledger. Profile
// JSON is not a second payment-history store.

// Payment status is read from a server-owned order and is bound to the verified caller.

// Stripe webhook — verified, idempotent MariaDB subscription activation

// PayPal orders are created server-side so amount, currency, plan and owner are bound
// before the browser is allowed to approve or capture the provider order.

// Provider credentials are selected as complete pairs. An incomplete
// deployment pair must never be combined with a MariaDB value from another
// account, which would make a save/reload or provider test appear successful
// while checkout still uses invalid credentials.

// Razorpay credentials are server-owned and never accepted from payment requests.

// ── Helpers: resolve complete provider credential pairs from env or MariaDB ──

// ── Paytm: server-owned transaction lifecycle ───────────────────────────────

// ── PhonePe: server-owned transaction lifecycle ─────────────────────────────

// Employer/job routes and helpers extracted to backend/routes/employer.js

// Export routes (render-data, PDF, DOCX) extracted to backend/routes/exports.js

// Applications for a job — MySQL authoritative (any authenticated reader of
// an active job may view; employers see their own jobs' applications).

// Employer mutations: EMPLOYER_COMPANY_CREATED, EMPLOYER_COMPANY_EDITED, EMPLOYER_COMPANY_DELETED, COMPANY_HAS_JOBS, EMPLOYER_JOB_CREATED, EMPLOYER_JOB_STATUS_CHANGED, EMPLOYER_JOB_EDITED, EMPLOYER_JOB_DELETED, EMPLOYER_JOB_CHANGED

// Public featured-company projection. It exposes only approved, explicitly
// featured presentation fields and never reuses the owner-scoped employer API.

// Employer company list — MySQL authoritative (owner-scoped).

// Employer job list — MySQL authoritative (owner-scoped).

// Export routes (render-data, PDF, DOCX) extracted to backend/routes/exports.js

// Export semaphore and template regex moved to backend/routes/exports.js

// PDF export route extracted to backend/routes/exports.js

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
app.get('/api/admin/payment-settings', requirePermission('system.config.read'), async (req, res) => {
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

// Provider credentials are selected as complete pairs. An incomplete
// deployment pair must never be combined with a MariaDB value from another
// account, which would make a save/reload or provider test appear successful
// while checkout still uses invalid credentials.
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
        quartarlyPrice: numberInRange(valueOrCurrent('quartarlyPrice'), 0, 1_000_000, 'Six-month price'),
        yearlyPrice: numberInRange(valueOrCurrent('yearlyPrice'), 0, 1_000_000, 'Yearly price'),
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
app.get('/api/admin/coupons', async (req, res) => {
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
            validUntil: row.valid_until ? adminIso(row.valid_until) : null,
            revision: Number(row.revision || 0),
            createdAt: adminIso(row.created_at),
            ...(row.extra_json ? (typeof row.extra_json === 'string' ? JSON.parse(row.extra_json) : row.extra_json) : {}),
        }));
        return res.json({ success: true, coupons });
    } catch (_error) {
        return res.status(503).json({ success: false, error: 'Coupon service unavailable.' });
    }
});

app.put('/api/admin/coupons/:code', async (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return res.status(400).json({ success: false, error: 'Invalid coupon code.' });
    try {
        const repo = resilientMutations.repoFor();
        const existing = await repo.getCoupon(code);
        const expectedRevision = Number(req.body?.expectedRevision || 0);
        if (existing && Number(existing.revision || 0) !== expectedRevision) return res.status(409).json({ success: false, code: 'CAS_CONFLICT', error: 'Coupon changed after loading.' });
        const discount = Number(req.body?.discount || 10);
        const record = {
            ...(existing || {}),
            code, discount,
            description: String(req.body?.description || `${discount}% Discount`).replace(/\p{Cc}/gu, ' ').slice(0, 200),
            active: req.body?.active !== false,
            expiryDate: req.body?.expiryDate || null,
            maxUses: Number(req.body?.maxUses || 0),
            singleUsePerUser: req.body?.singleUsePerUser === true,
            usedCount: Number(existing?.usedCount || 0),
            revision: Number(existing?.revision || 0) + 1,
        };
        await repo.saveCoupon(code, record);
        await resilientMutations.audit(repo, { action: 'COUPON_SAVED', actorUid: req.user.uid, code, revision: record.revision, requestId: res.locals.requestId });
        return res.json({ success: true, coupon: record });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/coupons/:code', async (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    try {
        const repo = resilientMutations.repoFor();
        const existing = await repo.getCoupon(code);
        if (!existing) return res.status(404).json({ success: false, error: 'Coupon not found.' });
        if (Number(existing.revision || 0) !== expectedRevision) return res.status(409).json({ success: false, code: 'CAS_CONFLICT', error: 'Coupon changed after loading.' });
        if (typeof repo.saveDocument === 'function') await repo.saveDocument('coupons_deleted', code, { ...existing, deleted: true, revision: expectedRevision + 1 });
        await repo.saveCoupon(code, { ...existing, active: false, revision: expectedRevision + 1 });
        await resilientMutations.audit(repo, { action: 'COUPON_DELETED', actorUid: req.user.uid, code, revision: expectedRevision, requestId: res.locals.requestId });
        return res.json({ success: true });
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

// MariaDB-authoritative, explicitly enabled discovery metadata. An outage or
// incomplete configuration never falls back to promotional copy.

// Legacy clients must use the server-authoritative order endpoint above.

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

// DOCX export route extracted to backend/routes/exports.js

// Item 44: RTL Native Font Support (Arabic/Hebrew) Helper
// Standard Health Check & RTL Font Config Helper

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

// Public, secret-free capability projection. The browser uses this to hide
// controls whose provider is disabled or unconfigured, so a user can never
// click a button that is guaranteed to return 404/503. It exposes booleans
// only: no hostname, key, credential, or provider error detail.

// Health route helpers (databaseHealthPayload, livenessPayload, computeReadyzPayload)
// extracted to backend/routes/health.js

// Readiness routes extracted to backend/routes/health.js — mounted below

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

app.get('/api/public/custom-pages/:slug', async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug)) {
        return res.status(400).json({ success: false, code: 'INVALID_PAGE_SLUG', error: 'Invalid page slug.' });
    }
    try {
        const page = await getRepository().getCustomPageBySlug(slug, { publishedOnly: true });
        res.setHeader('Cache-Control', 'no-store');
        if (!page) return res.status(404).json({ success: false, code: 'CUSTOM_PAGE_NOT_FOUND', error: 'Page not found.' });
        return res.json({ success: true, page, source: 'MARIADB_CUSTOM_PAGES' });
    } catch (_error) {
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

// OAuth routes and helpers extracted to backend/routes/oauth.js

// OAuth helper functions and routes extracted to backend/routes/oauth.js

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
    const adminEmails = String(process.env.PREVIEW_ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const superEmails = String(process.env.PREVIEW_SUPER_ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const role = superEmails.includes(email) ? 'SUPER_ADMIN' : adminEmails.includes(email) ? 'ADMIN' : 'USER';
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

// OAuth test-credential routes extracted to backend/routes/oauth.js

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

