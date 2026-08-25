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
const { queueEmailInTransaction, processOutboxOnce } = require('./services/notificationOutbox');
const { createResumeDocx, resolveExportTemplate } = require('./services/docxExport');
const { loadProviderConfiguration, generateWithProviders } = require('./services/aiRuntime');
const { loadAiAdminSettings, saveAiAdminSettings, testAiProvider, fetchProviderModels } = require('./services/aiAdmin');
const { mergeAdminSettingCategory } = require('./services/adminSettingsMerge');
const { resolveWriteOnlySecret, getPaymentSettingsProjection } = require('./services/paymentAdmin');
const { resolveEffectiveEntitlement } = require('./security/entitlements');
const { createExportRenderToken, consumeExportRenderToken, discardExportRenderToken } = require('./security/exportTokens');
const { createTenantService } = require('./enterprise/tenantService');
const { enterpriseRouter } = require('./routes/enterprise');
const { enterpriseM2mRouter } = require('./routes/enterpriseM2m');
const { enterpriseFeatureEnabled } = require('./enterprise/featureFlags');
const { createAdminAuditMiddleware } = require('./security/adminAudit');
const { adminAuditRouter } = require('./routes/adminAudit');
const { platformRouter } = require('./routes/platform');
const { adminUsersRouter, adminUserProjection } = require('./routes/adminUsers');
const { adminPlatformOperationsRouter } = require('./routes/adminPlatformOperations');
const { resumesRouter } = require('./routes/resumes');
const { portfoliosRouter } = require('./routes/portfolios');
const { coversRouter } = require('./routes/covers');
const { jobsDataRouter } = require('./routes/jobsData');
const { blogDataRouter } = require('./routes/blogData');
const { cmsPagesRouter } = require('./routes/cmsPages');
const { notificationsDataRouter } = require('./routes/notificationsData');
const { usersDataRouter } = require('./routes/usersData');
const { databaseAdminRouter } = require('./routes/databaseAdmin');
const app = express();
const cors = require('cors');
const cryptoRandom = require('crypto');
const { requireAuth, requirePermission, permissionsFor, requireSuperAdmin, requireRecentAdminAuthentication, isSuperAdmin } = require('./security/auth');
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
    isDuplicateProviderEventError,
    shouldReverseEntitlement,
    calculateMembershipEnd,
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
    assertTokenRecord,
    assertLeaseOwner,
    minimumEnumerationDelay,
} = require('./security/reset');
const {
    aiAccountLimiter,
    notificationAccountLimiter,
    exportAccountLimiter,
    scraperAccountLimiter,
    contactAccountLimiter,
    messagingAccountLimiter,
    enforceDailyAiQuota,
    bindNotificationRecipient
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

// Safe Module-Level Firebase Admin Initialization
let admin = null;
let db = null;
try {
    admin = require('./services/firebaseAdmin');
    if (!admin.apps.length) {
        let credential;
        const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
        const databaseURL = process.env.FIREBASE_DATABASE_URL || undefined;

        if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
            credential = admin.credential.cert({
                projectId,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            });
            console.log('[Firebase Admin] Initialized via environment variables');
        } else if (process.env.NODE_ENV === 'production' || process.env.FIREBASE_USE_ADC === 'true' || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            // Workload Identity / Application Default Credentials avoid long-lived key files.
            credential = admin.credential.applicationDefault();
            console.log('[Firebase Admin] Initialized via Application Default Credentials');
        } else {
            // Local builds without credentials can serve non-Firebase diagnostics only.
            admin.initializeApp({ projectId, databaseURL });
            console.log('[Firebase Admin] Initialized without credentials (limited local mode)');
        }

        if (credential) {
            admin.initializeApp({ credential, projectId, databaseURL });
            db = admin.firestore();
        }
    } else {
        db = admin.firestore();
    }
} catch (e) {
    console.warn('[Firebase Admin] Initialization notice:', e.message);
}
// Make Firestore accessible to routes via req.app.get('db')
app.set('db', db);
// The Firebase admin runtime is exposed for enterprise services (outbox,
// storage) that need FieldValue/Timestamp sentinels — never secrets.
app.set('firebaseAdmin', admin);
// The enterprise control plane is intentionally server-only. It is dormant until
// enterprise routes are enabled and does not alter certified UID-scoped paths.
app.set('tenantService', createTenantService({ db, admin }));
// Truthful one-time architecture statement. Never logs secrets or URLs.
if (enterpriseFeatureEnabled()) {
    const runtime = app.get('tenantService')?.describeRuntime?.() || {};
    console.log('[Enterprise Architecture]', JSON.stringify({
        enterpriseTenancy: 'ENABLED',
        dataProvider: `Enterprise Data Provider: ${String(runtime.dataProvider || 'unknown')}`,
        dataPlaneConfigured: runtime.dataPlaneConfigured === true,
        cache: 'Cache: none (Firestore is the durable store; no external cache exists in this architecture)',
        queue: 'Queue: Firestore Durable Outbox',
        encryption: `Encryption Provider: ${String(runtime.encryption?.provider === 'server-key' ? 'ServerKey' : runtime.encryption?.provider || 'none')}`,
        encryptionSecurityLevel: runtime.encryption?.securityLevel || null,
        quotaStore: runtime.quotaStore || 'unavailable',
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
                } catch (e) {}
            }
        }
    } catch (err) {
        console.warn('[Fonts] Auto-sync notice:', err.message);
    }
};
initSystemFonts();

// Start Autonomous Dual-Database Background Sync Worker (continuous polling + heartbeat)
const { startBackgroundSyncWorker, stopBackgroundSyncWorker } = require('./database/syncManager');
if (process.env.NODE_ENV !== 'test') {
    startBackgroundSyncWorker(db, 3000);
}

process.on('SIGTERM', () => {
    stopBackgroundSyncWorker();
});
process.on('SIGINT', () => {
    stopBackgroundSyncWorker();
});

app.use((req, res, next) => {
    const suppliedRequestId = req.get('x-request-id') || '';
    res.locals.requestId = /^[A-Za-z0-9._-]{1,80}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : cryptoRandom.randomUUID();
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
        'http://ai-resume-builder.local'
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

// Global API Rate Limiter (2500 requests per 15 minutes for interactive SPA & enterprise console usage)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 10000 : Number(process.env.GLOBAL_RATE_LIMIT_MAX || 2500),
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again in a few moments.', requestId: undefined } },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => req.user?.uid || req.ip || 'global',
    validate: { trustProxy: false, keyGeneratorIpFallback: false }
});
app.use('/api', globalLimiter);

// Strict Auth/Email Rate Limiter (20 requests per hour)
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: 'Too many sensitive requests from this IP, please try again after an hour'
});
app.use('/api/email', authLimiter);
app.use('/api/auth', authLimiter);

// Zero-trust API boundary. Requests are authenticated unless they are explicitly
// public protocol endpoints. Route handlers must still enforce their own role/ownership policy.
const publicApiPaths = new Set([
    '/healthz', '/readyz', '/health', '/service-availability', '/platform/version',
    '/stripe-webhook', '/public-export', '/export-render-data', '/contact', '/auth/custom-password-reset',
    '/auth/verify-email-token', '/auth/set-user-password', '/auth/linkedin', '/auth/linkedin/callback',
    '/auth/github', '/auth/github/callback', '/auth/oauth/exchange',
    '/public/custom-pages', '/public/custom-pages.json',
    '/public/trusted-by', '/public/trusted-by.json',
    '/custom-pages', '/custom-pages.json',
    '/trusted-by', '/trusted-by.json',
    '/cms-pages', '/blog-data', '/jobs-data'
]);
// Enterprise API authentication accepts exactly one credential kind per request:
// a Firebase bearer token (tenant member or support elevation) or an x-api-key
// service credential (M2M). Ambiguous requests are rejected outright.
const requireEnterpriseAuth = createEnterpriseAuthMiddleware({ requireAuth });
app.use('/api', (req, res, next) => {
    if (publicApiPaths.has(req.path)) return next();
    if (req.path.startsWith('/enterprise/')) return requireEnterpriseAuth(req, res, next);
    return requireAuth(req, res, next);
});
app.use('/api', (req, res, next) => {
    if (publicApiPaths.has(req.path)) return next();
    // Service principals and pending support elevations are governed by the
    // enterprise router's own fail-closed allowlists and RBAC.
    if (req.serviceContext || req.pendingSupportGrantId) return next();
    return enforceApiPolicy(req, res, next);
});

// Mount Data Abstraction Layer APIs
app.use('/api/resumes', resumesRouter);
app.use('/api/portfolios', portfoliosRouter);
app.use('/api/covers', coversRouter);
app.use('/api/jobs-data', jobsDataRouter);
app.use('/api/blog-data', blogDataRouter);
app.use('/api/cms-pages', cmsPagesRouter);
app.use('/api/notifications-data', notificationsDataRouter);
app.use('/api/users-data', usersDataRouter);
app.use('/api/admin/database-settings', databaseAdminRouter);

// During enterprise rollout, reject tenant/workspace headers on legacy routes rather
// than silently ignoring them. A client must use a tenant-aware /api/enterprise path
// or the certified UID-scoped legacy behavior, never an ambiguous hybrid request.
app.use('/api', async (req, res, next) => {
    const asksForTenantContext = Boolean(req.get('x-tenant-id') || req.get('x-workspace-id'));
    if (!asksForTenantContext || req.path.startsWith('/enterprise/')) return next();
    try {
        const { enterpriseFeatureEnabledAsync } = require('./enterprise/featureFlags');
        if (await enterpriseFeatureEnabledAsync(req.app.get('db'))) {
            return res.status(400).json({ error: { code: 'TENANT_CONTEXT_UNSUPPORTED_FOR_LEGACY_ROUTE', message: 'Use a tenant-aware enterprise API route for tenant-scoped operations', requestId: res.locals.requestId } });
        }
    } catch (_) { /* a disabled/unknown flag must not broaden legacy tenant access */ }
    return next();
});

// Cost and abuse boundaries are account-based in addition to the global IP limiter.
const aiPaths = [
    '/api/generate-resume', '/api/generate-summary', '/api/generate-interview',
    '/api/generate-work-description', '/api/generate-education-description',
    '/api/generate-skills', '/api/check-grammar', '/api/generate-ai-cover-letter',
    '/api/generate-content', '/api/parse-resume'
];
app.use(aiPaths, aiAccountLimiter, enforceDailyAiQuota);
app.use('/api/ai', aiAccountLimiter, enforceDailyAiQuota);
app.use('/api/admin/ai/test-provider', aiAccountLimiter);
const ownNotificationPaths = [
    '/api/notify/user-signup', '/api/notify/password-changed', '/api/notify/email-otp',
    '/api/notify/portfolio-published', '/api/notify/subscription-cancelled',
    '/api/send-invoice-email', '/api/email/send-invoice-email'
];
app.use(ownNotificationPaths, notificationAccountLimiter, bindNotificationRecipient);
app.use(['/api/export', '/api/public-export', '/api/export-docx'], exportAccountLimiter);
app.use('/api/linkedin-scraper', scraperAccountLimiter);
app.use('/api/contact', contactAccountLimiter);
app.use('/api/messages', messagingAccountLimiter);
// Defense in depth for administrative namespaces. The route policy also protects aliases
// such as /api/auth/purge-orphaned-auth and modular email routes mounted under /api.
app.use(['/api/admin', '/api/email/admin'], requirePermission('system.config.write'));

const stripe = require('stripe')(process.env.STRIPE_SECRET || 'missing');
async function getDynamicPlan(db, planId) {
    const defaultPricing = {
        monthly: { amount: 1999, currency: 'USD', months: 1 },
        halfYear: { amount: 9999, currency: 'USD', months: 6 },
        yearly: { amount: 17999, currency: 'USD', months: 12 }
    };
    const fallback = defaultPricing[planId];
    if (!fallback) { const err = new Error('INVALID_PLAN'); err.status = 400; throw err; }
    if (!db) return fallback;
    try {
        const publicDoc = await db.collection('data').doc('public_config').get();
        const publicConfig = publicDoc.data() || {};
        const billing = publicConfig.subscriptions || {};
        
        // Also check system_settings for primary platform currency
        const sysDoc = await db.collection('data').doc('system_settings').get();
        const sys = sysDoc.data() || {};
        
        let currency = String(billing.currency || sys.currency || 'INR').toUpperCase();
        
        // Check for multi-currency matrix
        if (billing.pricingMatrix && billing.pricingMatrix[currency]) {
            const matrix = billing.pricingMatrix[currency];
            const amount = Number(matrix[planId]);
            if (Number.isFinite(amount) && amount >= 0) {
                const multiplier = ['JPY'].includes(currency) ? 1 : 100;
                return { amount: Math.round(amount * multiplier), currency, months: fallback.months };
            }
        }
        
        // Fallback to legacy single-currency flat pricing if matrix is missing for this currency
        let baseAmount = planId === 'monthly' ? billing.monthlyPrice : 
                        (planId === 'yearly' ? billing.yearlyPrice : 
                        (planId === 'halfYear' ? billing.quartarlyPrice : null));
        if (baseAmount !== null && baseAmount !== undefined) {
             const multiplier = ['JPY'].includes(currency) ? 1 : 100;
             return { amount: Math.round(Number(baseAmount) * multiplier), currency, months: fallback.months };
        }
        return fallback;
    } catch (err) {
        return fallback;
    }
}

async function applyServerCoupon({ uid, orderId, plan, couponCode }) {
    const code = String(couponCode || '').trim().toUpperCase();
    if (!code) return { ...plan, originalAmount: plan.amount, couponCode: null, couponDiscount: 0 };
    if (!/^[A-Z0-9_-]{3,32}$/.test(code) || !db) throw Object.assign(new Error('INVALID_COUPON'), { status: 400 });
    const couponRef = db.collection('coupons').doc(code);
    const redemptionId = crypto.createHash('sha256').update(`${code}:${uid}`).digest('hex');
    const redemptionRef = db.collection('coupon_redemptions').doc(redemptionId);
    let resolved;
    await db.runTransaction(async tx => {
        const couponSnap = await tx.get(couponRef);
        if (!couponSnap.exists) throw Object.assign(new Error('INVALID_COUPON'), { status: 400 });
        const coupon = couponSnap.data();
        const expiry = coupon.expiryDate?.toDate?.() || new Date(coupon.expiryDate || 0);
        const discount = Number(coupon.discount || 0);
        if (coupon.active === false || !Number.isFinite(discount) || discount <= 0 || discount > 100
            || (coupon.expiryDate && expiry <= new Date())
            || (Number(coupon.maxUses || 0) > 0 && Number(coupon.usedCount || 0) >= Number(coupon.maxUses))) {
            throw Object.assign(new Error('COUPON_UNAVAILABLE'), { status: 409 });
        }
        if (coupon.singleUsePerUser) {
            const existing = await tx.get(redemptionRef);
            const existingData = existing.data();
            const activeReservation = existingData?.status === 'RESERVED'
                && Number(existingData.expiresAt || 0) > Date.now()
                && existingData.orderId !== orderId;
            if (existingData?.status === 'USED' || activeReservation) {
                throw Object.assign(new Error('COUPON_ALREADY_REDEEMED'), { status: 409 });
            }
            tx.set(redemptionRef, {
                uid, couponCode: code, orderId, status: 'RESERVED',
                expiresAt: Date.now() + 30 * 60 * 1000,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        const discountedAmount = Math.max(1, Math.round(plan.amount * (100 - discount) / 100));
        resolved = { ...plan, amount: discountedAmount, originalAmount: plan.amount, couponCode: code, couponDiscount: discount, singleUsePerUser: coupon.singleUsePerUser === true };
    });
    return resolved;
}

async function releaseCouponReservation(order) {
    if (!order?.couponCode || !order?.singleUsePerUser || !db) return;
    const redemptionId = crypto.createHash('sha256').update(`${order.couponCode}:${order.uid}`).digest('hex');
    const ref = db.collection('coupon_redemptions').doc(redemptionId);
    await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.data().status === 'RESERVED' && snap.data().orderId === order.id) tx.delete(ref);
    }).catch(() => {});
}

async function releaseCouponForRef(ref) {
    if (!ref) return;
    const snapshot = await ref.get().catch(() => null);
    if (snapshot?.exists) await releaseCouponReservation({ ...snapshot.data(), id: ref.id });
}

async function consumeCouponRedemption(orderId, order) {
    if (!order?.couponCode || !db) return;
    const couponRef = db.collection('coupons').doc(order.couponCode);
    const redemptionScope = order.singleUsePerUser ? order.uid : orderId;
    const redemptionId = crypto.createHash('sha256').update(`${order.couponCode}:${redemptionScope}`).digest('hex');
    const redemptionRef = db.collection('coupon_redemptions').doc(redemptionId);
    await db.runTransaction(async tx => {
        const couponSnap = await tx.get(couponRef);
        if (!couponSnap.exists) return;
        const redemption = await tx.get(redemptionRef);
        if (redemption.data()?.status === 'USED') return;
        tx.set(redemptionRef, {
            uid: order.uid, couponCode: order.couponCode, orderId,
            status: 'USED', usedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        tx.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });
    });
}

async function activateVerifiedOrder(orderRef, gatewayLabel, providerPaymentId) {
    if (!db || !admin) throw Object.assign(new Error('PAYMENT_SERVICE_UNAVAILABLE'), { status: 503 });
    await db.runTransaction(async tx => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists) throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 });
        const order = orderSnap.data();
        const paymentEventId = notificationEventId('payment_active', orderRef.id);
        const paymentNotificationRef = db.collection('notifications').doc(order.uid).collection('userNotifications').doc(paymentEventId);
        if (order.status === 'ACTIVE') {
            tx.set(paymentNotificationRef, { eventId: paymentEventId, state: 'NOTIFICATION_CREATED', deliveryState: 'NOT_REQUESTED', type: 'payment_active', title: 'Payment confirmed', message: 'Your payment was confirmed and premium access is active.', data: { paymentOrderId: orderRef.id, planId: order.planId }, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            return;
        }
        if (!['PAYMENT_CREATED', 'PENDING_PAYMENT', 'PROVIDER_CONFIRMED'].includes(order.status)) {
            throw Object.assign(new Error('INVALID_ORDER_STATE'), { status: 409 });
        }
        const months = order.planId === 'yearly' ? 12 : (order.planId === 'halfYear' ? 6 : 1);
        const userRef = db.collection('users').doc(order.uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error('PAYMENT_USER_NOT_FOUND');
        const membershipEnds = calculateMembershipEnd(userSnap.data().membershipEnds, months);
        tx.update(userRef, {
            membership: 'Premium', membershipEnds, paymentStatus: 'ACTIVE',
            lastPaymentGateway: gatewayLabel, lastPaymentOrderId: orderRef.id, cancellationRequested: false,
            lastPaymentSync: admin.firestore.FieldValue.serverTimestamp()
        });
        tx.update(orderRef, {
            status: 'ACTIVE', membershipEnds, providerPaymentId: providerPaymentId || null,
            activatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        tx.set(paymentNotificationRef, { eventId: paymentEventId, state: 'NOTIFICATION_CREATED', deliveryState: 'NOT_REQUESTED', type: 'payment_active', title: 'Payment confirmed', message: 'Your payment was confirmed and premium access is active.', data: { paymentOrderId: orderRef.id, planId: order.planId }, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    const activatedOrder = (await orderRef.get()).data();
    await consumeCouponRedemption(orderRef.id, activatedOrder);
    return activatedOrder;
}
async function createProviderOrderRecord({ uid, planId, provider, couponCode }) {
    const basePlan = await getDynamicPlan(db, planId);
    if (!db || !admin) throw Object.assign(new Error('PAYMENT_SERVICE_UNAVAILABLE'), { status: 503 });
    const ref = db.collection('payment_orders').doc();
    const plan = await applyServerCoupon({ uid, orderId: ref.id, plan: basePlan, couponCode });
    await ref.create({
        uid, planId, provider, amount: plan.amount, originalAmount: plan.originalAmount,
        currency: plan.currency, couponCode: plan.couponCode, couponDiscount: plan.couponDiscount,
        singleUsePerUser: plan.singleUsePerUser === true,
        status: 'PENDING_PAYMENT', createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { ref, plan };
}
async function createPaymentOrder({ uid, planId, idempotencyKey, couponCode }) {
    const basePlan = await getDynamicPlan(db, planId);
    if (!basePlan) { const err = new Error('INVALID_PLAN'); err.status = 400; throw err; }
    if (!db || !admin) { const err = new Error('PAYMENT_SERVICE_UNAVAILABLE'); err.status = 503; throw err; }
    if (!process.env.STRIPE_SECRET) { const err = new Error('PAYMENT_PROVIDER_UNAVAILABLE'); err.status = 503; throw err; }
    const deterministicId = idempotencyKey
        ? crypto.createHash('sha256').update(`${uid}:${planId}:${String(couponCode || '').toUpperCase()}:${idempotencyKey}`).digest('hex')
        : null;
    const orderRef = deterministicId ? db.collection('payment_orders').doc(deterministicId) : db.collection('payment_orders').doc();
    const plan = await applyServerCoupon({ uid, orderId: orderRef.id, plan: basePlan, couponCode });
    try {
        await orderRef.create({
            uid, planId, provider: 'stripe', amount: plan.amount, originalAmount: plan.originalAmount,
            currency: plan.currency, couponCode: plan.couponCode, couponDiscount: plan.couponDiscount,
            singleUsePerUser: plan.singleUsePerUser === true,
            status: 'PENDING_PAYMENT', createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        if (error.code !== 6 && error.code !== 'already-exists') throw error;
        const existing = await orderRef.get();
        const order = existing.data() || {};
        if (order.uid !== uid || order.planId !== planId || order.provider !== 'stripe') throw Object.assign(new Error('IDEMPOTENCY_CONFLICT'), { status: 409 });
        if (order.status === 'PAYMENT_CREATED' && order.providerClientSecret) {
            return { orderId: orderRef.id, clientSecret: order.providerClientSecret, amount: order.amount, currency: order.currency, replayed: true };
        }
        throw Object.assign(new Error('PAYMENT_CREATION_IN_PROGRESS'), { status: 409 });
    }
    try {
        const intent = await stripe.paymentIntents.create({
            amount: plan.amount, currency: plan.currency,
            metadata: { orderId: orderRef.id, uid, planId }
        }, { idempotencyKey: `order:${orderRef.id}` });
        await orderRef.update({
            providerPaymentIntentId: intent.id,
            providerClientSecret: intent.client_secret,
            status: 'PAYMENT_CREATED',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { orderId: orderRef.id, clientSecret: intent.client_secret, amount: plan.amount, currency: plan.currency };
    } catch (err) {
        await orderRef.update({ status: 'FAILED', failureCode: 'PROVIDER_CREATE_FAILED', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await releaseCouponForRef(orderRef);
        throw err;
    }
}
app.post('/api/pay', async (req, res) => {
    try {
        const suppliedKey = String(req.get('idempotency-key') || '');
        const idempotencyKey = /^ck_[A-Za-z0-9_-]{10,100}$/.test(suppliedKey) ? suppliedKey : crypto.randomUUID();
        const result = await createPaymentOrder({ uid: req.user.uid, planId: req.body.planId || req.body.plan, idempotencyKey, couponCode: req.body.couponCode });
        return res.status(201).json({ orderId: result.orderId, client_secret: result.clientSecret, amount: result.amount, currency: result.currency, status: 'PAYMENT_PENDING' });
    } catch (err) {
        console.error('[Stripe payment create]', err.message);
        return res.status(err.status || 500).json({ error: { code: err.message === 'INVALID_PLAN' ? 'INVALID_PLAN' : 'PAYMENT_UNAVAILABLE', message: 'Unable to create payment', requestId: res.locals.requestId } });
    }
});


// Payment status is read from a server-owned order and is bound to the verified caller.
app.get('/api/payment-orders/:orderId', async (req, res) => {
    if (!db || !/^[A-Za-z0-9_-]{1,128}$/.test(req.params.orderId)) return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found', requestId: res.locals.requestId } });
    const snap = await db.collection('payment_orders').doc(req.params.orderId).get();
    if (!snap.exists || snap.data().uid !== req.user.uid) return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found', requestId: res.locals.requestId } });
    const order = snap.data();
    return res.json({ orderId: snap.id, status: order.status, planId: order.planId, membershipEnds: order.membershipEnds || null });
});

// Stripe Webhook — instant subscription activation + Firestore sync
app.post('/api/stripe-webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('Stripe webhook is not configured');
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('[Stripe Webhook] Signature error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
        const paymentData = event.data.object;
        const orderId = paymentData.metadata?.orderId;
        if (!db || !orderId) return res.status(400).json({ error: 'Unknown payment order' });
        const eventRef = db.collection('payment_webhook_events').doc(event.id);
        const orderRef = db.collection('payment_orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) return res.status(400).json({ error: 'Unknown payment order' });
        const order = orderSnap.data();
        try {
            validateStripePaymentIntent(order, paymentData, orderId);
        } catch (_) {
            return res.status(400).json({ error: 'Payment order mismatch' });
        }
        const userId = order.uid;
        const plan = order.planId;
        try {
            // Firestore create is atomic: replayed or concurrent events cannot both claim the event id.
            await eventRef.create({ provider: 'stripe', eventType: event.type, orderId, receivedAt: admin.firestore.FieldValue.serverTimestamp() });
        } catch (err) {
            if (isDuplicateProviderEventError(err)) return res.json({ received: true, duplicate: true });
            throw err;
        }
        console.log(`[Stripe Webhook] verified order ${orderId}`);

        const monthsByPlan = { monthly: 1, halfYear: 6, yearly: 12 };
        const months = monthsByPlan[plan];
        if (!months) return res.status(400).json({ error: 'Invalid payment plan' });
        try {
            await db.runTransaction(async tx => {
                const currentOrder = await tx.get(orderRef);
                if (!currentOrder.exists || currentOrder.data().status === 'ACTIVE') return;
                const userRef = db.collection('users').doc(userId);
                const userSnap = await tx.get(userRef);
                if (!userSnap.exists) throw new Error('PAYMENT_USER_NOT_FOUND');
                const expDate = calculateMembershipEnd(userSnap.data().membershipEnds, months);
                tx.update(userRef, {
                    membership: 'Premium', membershipEnds: expDate, autoRenew: true,
                    paymentStatus: 'ACTIVE', lastPaymentGateway: 'Stripe', lastPaymentOrderId: orderId, cancellationRequested: false,
                    lastWebhookSync: admin.firestore.FieldValue.serverTimestamp()
                });
                tx.update(orderRef, { status: 'ACTIVE', activatedAt: admin.firestore.FieldValue.serverTimestamp(), membershipEnds: expDate });
            });
        } catch (err) {
            // Event claim is released on processing failure so Stripe can safely retry.
            await eventRef.delete().catch(() => {});
            throw err;
        }
        const activated = (await orderRef.get()).data();
        await consumeCouponRedemption(orderId, activated);
        const expDate = activated.membershipEnds?.toDate?.() || new Date(activated.membershipEnds);
        return res.json({
            received: true,
            status: 'activated',
            userId,
            membership: 'Premium',
            membershipEnds: expDate.toISOString(),
        });
    }

    if (event.type === 'payment_intent.payment_failed') {
        const payment = event.data.object;
        const orderId = payment.metadata?.orderId;
        if (db && orderId) {
            const orderRef = db.collection('payment_orders').doc(orderId);
            const snap = await orderRef.get();
            if (snap.exists && snap.data().providerPaymentIntentId === payment.id) {
                const eventRef = db.collection('payment_webhook_events').doc(event.id);
                try {
                    await eventRef.create({ provider: 'stripe', eventType: event.type, orderId, receivedAt: admin.firestore.FieldValue.serverTimestamp() });
                    await orderRef.update({ status: 'FAILED', failureCode: payment.last_payment_error?.code || 'PAYMENT_FAILED', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                } catch (error) {
                    if (error.code !== 6 && error.code !== 'already-exists') throw error;
                }
            }
        }
        return res.json({ received: true });
    }

    if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
        const providerObject = event.data.object;
        const paymentIntentId = providerObject.payment_intent;
        if (!db || !paymentIntentId) return res.status(400).json({ error: 'Unknown payment order' });
        const orders = await db.collection('payment_orders').where('providerPaymentIntentId', '==', paymentIntentId).limit(1).get();
        if (orders.empty) return res.status(400).json({ error: 'Unknown payment order' });
        const orderRef = orders.docs[0].ref;
        const order = orders.docs[0].data();
        const status = event.type === 'charge.refunded' ? 'REFUNDED' : 'CHARGEBACK';
        const eventRef = db.collection('payment_webhook_events').doc(event.id);
        try {
            await eventRef.create({ provider: 'stripe', eventType: event.type, orderId: orderRef.id, receivedAt: admin.firestore.FieldValue.serverTimestamp() });
        } catch (error) {
            if (isDuplicateProviderEventError(error)) return res.json({ received: true, duplicate: true });
            throw error;
        }
        await db.runTransaction(async tx => {
            const userRef = db.collection('users').doc(order.uid);
            const userSnap = await tx.get(userRef);
            tx.update(orderRef, { status, reversedAt: admin.firestore.FieldValue.serverTimestamp() });
            // Do not remove a later legitimate purchase when an older order is reversed.
            if (userSnap.exists && shouldReverseEntitlement(userSnap.data(), orderRef.id)) {
                tx.update(userRef, {
                    membership: 'Basic', paymentStatus: status, autoRenew: false,
                    membershipEnds: new Date(), lastPaymentSync: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });
        return res.json({ received: true, status: status.toLowerCase() });
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
// deployment pair must never be combined with a Firestore value from another
// account, which would make a save/reload or provider test appear successful
// while checkout still uses invalid credentials.
function chooseCredentialPair({ environmentId, environmentSecret, storedId, storedSecret, environmentName = 'environment', storedName = 'firestore' }) {
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

async function paypalConfig(database = db) {
    const envClientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
    const envClientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
    let environment = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
    let storedClientId = '';
    let storedClientSecret = '';
    let storedEnvironment = '';
    if (database) {
        const [providerSnapshot, legacySnapshot] = await Promise.all([
            database.collection('settings').doc('payment_providers').get(),
            database.collection('data').doc('subscriptions').get(),
        ]);
        const stored = providerSnapshot.data()?.paypal || {};
        const legacy = legacySnapshot.data() || {};
        storedClientId = String(stored.clientId || legacy.paypalClientId || '').trim();
        storedClientSecret = String(stored.clientSecret || legacy.paypalClientSecret || '').trim();
        storedEnvironment = String(stored.environment || '').trim();
    }
    const selected = chooseCredentialPair({
        environmentId: envClientId,
        environmentSecret: envClientSecret,
        storedId: storedClientId,
        storedSecret: storedClientSecret,
    });
    if (storedEnvironment && selected.source === 'firestore') environment = storedEnvironment.toLowerCase();
    if (!selected.id || !selected.secret) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
    const baseUrl = environment === 'live' || environment === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    return { clientId: selected.id, clientSecret: selected.secret, baseUrl, source: selected.source };
}
app.post('/api/paypal/create-order', async (req, res) => {
    let orderRef;
    try {
        const { clientId, clientSecret, baseUrl } = await paypalConfig(req.app.get('db'));
        const { ref, plan } = await createProviderOrderRecord({ uid: req.user.uid, planId: req.body.planId, provider: 'paypal', couponCode: req.body.couponCode });
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
        await ref.update({ providerOrderId: providerOrder.id, status: 'PAYMENT_CREATED', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
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
        const orderRef = db.collection('payment_orders').doc(paymentOrderId);
        const internalSnap = await orderRef.get();
        const internal = internalSnap.data();
        try {
            if (!internalSnap.exists) throw new Error('ORDER_NOT_FOUND');
            assertInternalOrder(internal, { uid: req.user.uid, provider: 'paypal', providerOrderId });
        } catch (_) {
            return res.status(404).json({ verified: false, error: 'Order not found' });
        }
        const { clientId, clientSecret, baseUrl } = await paypalConfig(req.app.get('db'));
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
        return res.json({ verified: true, orderId: providerOrderId, paymentOrderId, status: active.status, membershipEnds: active.membershipEnds });
    } catch (err) {
        console.error('[PayPal verify]', err.message);
        return res.status(err.status || 502).json({ verified: false, error: 'PayPal verification unavailable' });
    }
});

// Razorpay credentials are server-owned and never accepted from payment requests.
async function getRazorpayKeys(database) {
    const envKeyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
    const envKeySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
    let storedKeyId = '';
    let storedSecret = '';
    // A complete environment pair is deployment-managed and wins as a pair. Do
    // not accidentally combine an old environment key ID with a newly saved
    // Firestore secret (or vice versa); that was the source of misleading
    // "saved but checkout still fails" reports.
    if (envKeyId && envKeySecret) return { keyId: envKeyId, keySecret: envKeySecret, source: 'environment' };
    if (database) {
        try {
            const [providerSnapshot, legacySnapshot] = await Promise.all([
                database.collection('settings').doc('payment_providers').get(),
                database.collection('data').doc('subscriptions').get(),
            ]);
            const stored = providerSnapshot.data()?.razorpay || {};
            const legacy = legacySnapshot.data() || {};
            storedKeyId = String(stored.keyId || '').trim() || String(legacy.razorpayKeyId || '').trim();
            storedSecret = String(stored.keySecret || '').trim() || String(legacy.razorpayKeySecret || '').trim();
            const selected = chooseCredentialPair({ environmentId: envKeyId, environmentSecret: envKeySecret, storedId: storedKeyId, storedSecret });
            return { keyId: selected.id, keySecret: selected.secret, source: selected.source };
        } catch (error) {
            console.warn('[Razorpay config]', error.message);
        }
    }
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
        const { keyId, keySecret } = await getRazorpayKeys(req.app.get('db'));
        if (!keyId || !keySecret) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
        const { ref, plan } = await createProviderOrderRecord({ uid: req.user.uid, planId: req.body.planId || req.body.plan, provider: 'razorpay', couponCode: req.body.couponCode });
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
        await ref.update({ providerOrderId: providerOrder.id, status: 'PAYMENT_CREATED', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return res.status(201).json({ id: providerOrder.id, paymentOrderId: ref.id, amount: plan.amount, currency: plan.currency, key: keyId });
    } catch (err) {
        if (internalRef) {
            await internalRef.update({ status: 'FAILED', failureCode: 'PROVIDER_CREATE_FAILED' }).catch(() => {});
            await releaseCouponForRef(internalRef);
        }
        console.error('[Razorpay create]', err.message);
        return res.status(err.status || 502).json({ error: { code: err.message, message: 'Unable to create Razorpay order', requestId: res.locals.requestId } });
    }
});

app.post('/api/razorpay/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id: providerOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
        const paymentOrderId = String(req.body.paymentOrderId || '');
        if (![providerOrderId, paymentId, signature, paymentOrderId].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value))) {
            return res.status(400).json({ verified: false, error: 'Invalid payment confirmation' });
        }
        const orderRef = db.collection('payment_orders').doc(paymentOrderId);
        const orderSnap = await orderRef.get();
        const order = orderSnap.data();
        try {
            if (!orderSnap.exists) throw new Error('ORDER_NOT_FOUND');
            assertInternalOrder(order, { uid: req.user.uid, provider: 'razorpay', providerOrderId });
        } catch (_) {
            return res.status(404).json({ verified: false, error: 'Order not found' });
        }
        const { keyId, keySecret } = await getRazorpayKeys(req.app.get('db'));
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
        return res.json({ verified: true, status: active.status, paymentOrderId, membershipEnds: active.membershipEnds });
    } catch (err) {
        console.error('[Razorpay verify]', err.message);
        return res.status(err.status || 502).json({ verified: false, error: 'Razorpay verification unavailable' });
    }
});

// ── Helper: Resolve Paytm Credentials from Firestore / .env ──────────────────
async function getPaytmConfig(database = db) {
    const envMid = String(process.env.PAYTM_MID || '').trim();
    const envKey = String(process.env.PAYTM_MERCHANT_KEY || '').trim();
    let storedMid = '';
    let storedKey = '';
    let website = process.env.PAYTM_WEBSITE || 'WEBSTAGING';
    const channelId = process.env.PAYTM_CHANNEL_ID || 'WEB';
    const env = (process.env.PAYTM_ENV || 'staging').toLowerCase();
    const isLive = env === 'production' || env === 'live';
    const baseUrl = isLive ? 'https://securegw.paytm.in' : 'https://securegw-stage.paytm.in';

    if (database) {
        try {
            const [providerSnapshot, legacySnapshot] = await Promise.all([
                database.collection('settings').doc('payment_providers').get(),
                database.collection('data').doc('subscriptions').get(),
            ]);
            const stored = providerSnapshot.data()?.paytm || {};
            const legacy = legacySnapshot.data() || {};
            storedMid = String(stored.mid || legacy.paytmMid || '').trim();
            storedKey = String(stored.merchantKey || legacy.paytmMerchantKey || '').trim();
            if (stored.website || legacy.paytmWebsite) website = stored.website || legacy.paytmWebsite;
        } catch (e) {
            console.warn('[Paytm Config] Firestore lookup notice:', e.message);
        }
    }
    const selected = chooseCredentialPair({ environmentId: envMid, environmentSecret: envKey, storedId: storedMid, storedSecret: storedKey });
    return { mid: selected.id, key: selected.secret, website, channelId, baseUrl, isLive, source: selected.source };
}

// ── Helper: Resolve PhonePe Credentials from Firestore / .env ────────────────
async function getPhonePeConfig(database = db) {
    const envMerchantId = String(process.env.PHONEPE_MERCHANT_ID || '').trim();
    const envSaltKey = String(process.env.PHONEPE_SALT_KEY || '').trim();
    let storedMerchantId = '';
    let storedSaltKey = '';
    let saltIndex = parseInt(process.env.PHONEPE_SALT_INDEX || '1', 10) || 1;
    const env = (process.env.PHONEPE_ENV || 'sandbox').toLowerCase();
    const isLive = env === 'production' || env === 'live';
    const baseUrl = isLive
        ? 'https://api.phonepe.com/apis/hermes'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

    if (database) {
        try {
            const [providerSnapshot, legacySnapshot] = await Promise.all([
                database.collection('settings').doc('payment_providers').get(),
                database.collection('data').doc('subscriptions').get(),
            ]);
            const stored = providerSnapshot.data()?.phonepe || {};
            const legacy = legacySnapshot.data() || {};
            storedMerchantId = String(stored.merchantId || legacy.phonepeId || '').trim();
            storedSaltKey = String(stored.saltKey || legacy.phonepeSaltKey || '').trim();
            if (stored.saltIndex || legacy.phonepeSaltIndex) saltIndex = parseInt(stored.saltIndex || legacy.phonepeSaltIndex || saltIndex, 10) || 1;
        } catch (e) {
            console.warn('[PhonePe Config] Firestore lookup notice:', e.message);
        }
    }
    const selected = chooseCredentialPair({ environmentId: envMerchantId, environmentSecret: envSaltKey, storedId: storedMerchantId, storedSecret: storedSaltKey });
    return { merchantId: selected.id, saltKey: selected.secret, saltIndex, baseUrl, isLive, source: selected.source };
}

// ── Paytm: server-owned transaction lifecycle ───────────────────────────────
app.post('/api/paytm/initiate-transaction', async (req, res) => {
    let orderRef;
    try {
        const { mid, key, website, channelId, baseUrl, isLive } = await getPaytmConfig(req.app.get('db'));
        if (!mid || !key) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
        const { ref, plan } = await createProviderOrderRecord({ uid: req.user.uid, planId: req.body.planId || req.body.plan, provider: 'paytm', couponCode: req.body.couponCode });
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
        await ref.update({ providerOrderId, status: 'PAYMENT_CREATED', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
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
        const orderRef = db.collection('payment_orders').doc(orderId);
        const snap = await orderRef.get();
        const order = snap.data();
        try {
            if (!snap.exists) throw new Error('ORDER_NOT_FOUND');
            assertInternalOrder(order, { uid: req.user.uid, provider: 'paytm', providerOrderId: orderId });
        } catch (_) {
            return res.status(404).json({ verified: false, error: 'Order not found' });
        }
        const { mid, key, baseUrl } = await getPaytmConfig(req.app.get('db'));
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
        return res.json({ verified: true, status: active.status, txnId: body.txnId, orderId, membershipEnds: active.membershipEnds });
    } catch (err) {
        console.error('[Paytm verify]', err.message);
        return res.status(err.status || 502).json({ verified: false, error: 'Paytm verification unavailable' });
    }
});

// ── PhonePe: server-owned transaction lifecycle ─────────────────────────────
app.post('/api/phonepe/initiate', async (req, res) => {
    let orderRef;
    try {
        const { merchantId, saltKey, saltIndex, baseUrl, isLive } = await getPhonePeConfig(req.app.get('db'));
        if (!merchantId || !saltKey) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
        const { ref, plan } = await createProviderOrderRecord({ uid: req.user.uid, planId: req.body.planId || req.body.plan, provider: 'phonepe', couponCode: req.body.couponCode });
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
        await ref.update({ providerOrderId: ref.id, status: 'PAYMENT_CREATED', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
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
        const orderRef = db.collection('payment_orders').doc(orderId);
        const snap = await orderRef.get();
        const order = snap.data();
        try {
            if (!snap.exists) throw new Error('ORDER_NOT_FOUND');
            assertInternalOrder(order, { uid: req.user.uid, provider: 'phonepe', providerOrderId: orderId });
        } catch (_) {
            return res.status(404).json({ verified: false, error: 'Order not found' });
        }
        const { merchantId, saltKey, saltIndex, baseUrl } = await getPhonePeConfig(req.app.get('db'));
        if (!merchantId || !saltKey) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
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
        return res.json({ verified: true, status: active.status, state: providerData.data.state, paymentId, orderId, membershipEnds: active.membershipEnds });
    } catch (err) {
        console.error('[PhonePe status]', err.message);
        return res.status(err.status || 502).json({ verified: false, error: 'PhonePe verification unavailable' });
    }
});

app.post('/api/subscription/preferences', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, error: 'Subscription service unavailable.' });
    const updates = {};
    if (typeof req.body.autoRenew === 'boolean') updates.autoRenew = req.body.autoRenew;
    if (req.body.cancel === true) {
        updates.autoRenew = false;
        updates.cancellationRequested = true;
        updates.cancellationReason = String(req.body.reason || 'User requested cancellation').trim().slice(0, 500);
        updates.cancellationDate = admin.firestore.FieldValue.serverTimestamp();
    }
    if (!Object.keys(updates).length) return res.status(400).json({ success: false, error: 'No supported preference supplied.' });
    await db.collection('users').doc(req.user.uid).set(updates, { merge: true });
    return res.json({ success: true, message: req.body.cancel === true
        ? 'Cancellation request recorded. Access remains active through the paid term.'
        : `Auto-renew ${updates.autoRenew ? 'enabled' : 'disabled'}.` });
});

app.post('/api/check', async (req, res) => {
    // Reject legacy client-supplied entitlement fields — membership is server-authoritative only.
    const legacyClientFields = ['accountType', 'expDate', 'membership', 'paymentStatus', 'membershipEnds'];
    if (legacyClientFields.some(f => Object.hasOwn(req.body || {}, f))) {
        return res.status(503).json({ status: 'false', error: 'Client-supplied entitlement context is not accepted' });
    }
    if (!db) return res.status(503).json({ status: 'false', error: 'Entitlement service unavailable' });
    try {
        const userSnap = await db.collection('users').doc(req.user.uid).get();
        const user = userSnap.data() || {};
        const expiry = user.membershipEnds?.toDate?.() || new Date(user.membershipEnds || 0);
        const entitled = user.membership === 'Premium' && ['ACTIVE', 'ADMIN_GRANTED'].includes(user.paymentStatus) && expiry > new Date();
        return res.json({ status: entitled ? 'true' : 'false', membershipEnds: entitled ? expiry.toISOString() : null });
    } catch (error) {
        console.error('[Entitlement check]', error.message);
        return res.status(503).json({ status: 'false', error: 'Entitlement service unavailable' });
    }
});

function notificationEventId(...parts) { return crypto.createHash('sha256').update(parts.join('\0')).digest('hex'); }

function jobApplicationNotification(status, jobTitle, companyName, notes = '') {
    const suffix = notes ? ` ${notes}` : '';
    if (status === 'interview') return { type: 'application_interview', title: 'Interview invitation', message: `You have been invited to interview for ${jobTitle} at ${companyName}.${suffix}` };
    if (status === 'accepted') return { type: 'application_accepted', title: 'Application accepted', message: `Your application for ${jobTitle} at ${companyName} was accepted.${suffix}` };
    if (status === 'rejected') return { type: 'application_rejected', title: 'Application update', message: `Your application for ${jobTitle} at ${companyName} was not selected.${suffix}` };
    return { type: 'application_status_update', title: 'Application status updated', message: `Your application for ${jobTitle} at ${companyName} is now ${status}.${suffix}` };
}

app.post('/api/jobs/:jobId/applications', async (req, res) => {
    const requestDb = req.app.get('db');
    const jobId = String(req.params.jobId || '');
    const fullName = String(req.body?.fullName || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 120);
    const phone = String(req.body?.phone || '').replace(/\p{Cc}/gu, '').trim().slice(0, 30);
    const linkedInUrl = safePublicUrl(req.body?.linkedinUrl);
    const githubUrl = safePublicUrl(req.body?.githubUrl);
    const coverLetter = String(req.body?.coverLetter || '').slice(0, 20_000);
    const coverText = coverLetter.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const resumeId = String(req.body?.resumeId || '').trim();
    if (!requestDb || !admin || !/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return res.status(400).json({ success: false, error: 'A valid job is required.' });
    if (!String(req.user.email || '').trim()) return res.status(403).json({ success: false, error: 'A verified account email is required.' });
    if (!fullName || !/^\+?[0-9 ()-]{7,30}$/.test(phone) || coverText.length < 50 || coverText.length > 1000) {
        return res.status(400).json({ success: false, error: 'Valid name, phone, and a 50–1000 character cover letter are required.' });
    }
    if ((req.body?.linkedinUrl && (!linkedInUrl || !linkedInUrl.startsWith('https:'))) || (req.body?.githubUrl && (!githubUrl || !githubUrl.startsWith('https:')))) {
        return res.status(400).json({ success: false, error: 'Profile links must use HTTPS.' });
    }
    if (resumeId && !/^[A-Za-z0-9_-]{1,128}$/.test(resumeId)) return res.status(400).json({ success: false, error: 'Invalid resume selection.' });
    const applicationId = `${req.user.uid}_${jobId}`;
    const applicationRef = requestDb.collection('jobApplications').doc(applicationId);
    const jobRef = requestDb.collection('jobs').doc(jobId);
    const resumeRef = resumeId ? requestDb.collection('users').doc(req.user.uid).collection('resumes').doc(resumeId) : null;
    try {
        let responseData;
        await requestDb.runTransaction(async transaction => {
            const reads = [transaction.get(applicationRef), transaction.get(jobRef), ...(resumeRef ? [transaction.get(resumeRef)] : [])];
            const [existing, jobSnapshot, resumeSnapshot] = await Promise.all(reads);
            if (existing.exists) { const duplicate = new Error('You have already applied to this job.'); duplicate.code = 'ALREADY_APPLIED'; throw duplicate; }
            if (!jobSnapshot.exists || jobSnapshot.data()?.status !== 'active') { const unavailable = new Error('This job is no longer accepting applications.'); unavailable.code = 'JOB_UNAVAILABLE'; throw unavailable; }
            if (resumeRef && !resumeSnapshot?.exists) { const invalidResume = new Error('The selected resume was not found.'); invalidResume.code = 'RESUME_NOT_FOUND'; throw invalidResume; }
            const job = jobSnapshot.data() || {};
            const employerUser = job.employerId ? await transaction.get(requestDb.collection('users').doc(job.employerId)) : null;
            const resume = resumeSnapshot?.data() || null;
            if (resume && Buffer.byteLength(JSON.stringify(resume), 'utf8') > 600_000) { const oversized = new Error('The selected resume is too large to attach.'); oversized.code = 'RESUME_TOO_LARGE'; throw oversized; }
            const email = String(req.user.email || '').trim().toLowerCase();
            const jobTitle = String(job.title || 'Job').replace(/\p{Cc}/gu, ' ').trim().slice(0, 160);
            const companyName = String(job.company || 'Company').replace(/\p{Cc}/gu, ' ').trim().slice(0, 160);
            const application = {
                userId: req.user.uid, jobId, applicantName: fullName, fullName,
                applicantEmail: email, email, phone,
                linkedinUrl: linkedInUrl || '', githubUrl: githubUrl || '', coverLetter,
                selectedResume: resume ? { id: resumeId, name: String(resume.title || resume.name || 'Resume').slice(0, 120), data: resume } : null,
                resumeId: resumeId || '', resumeUrl: '', status: 'pending', revision: 1,
                skills: [], experience: '',
                appliedAt: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                jobSnapshot: {
                    title: jobTitle, company: companyName,
                    location: String(job.location || '').slice(0, 200), country: String(job.country || '').slice(0, 100),
                    minSalary: Number.isFinite(Number(job.minSalary)) ? Number(job.minSalary) : null,
                    maxSalary: Number.isFinite(Number(job.maxSalary)) ? Number(job.maxSalary) : null,
                    jobType: String(job.jobType || job.type || '').slice(0, 80), workMode: String(job.workMode || '').slice(0, 80),
                    description: String(job.description || '').slice(0, 10_000), requirements: Array.isArray(job.requirements) ? job.requirements.slice(0, 50).map(item => String(item).slice(0, 500)) : [],
                },
            };
            transaction.set(applicationRef, application);
            transaction.update(jobRef, { applicationsCount: Number(job.applicationsCount || 0) + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            const submittedEventId = notificationEventId('job_application_submitted', applicationId);
            queueEmailInTransaction(transaction, requestDb, admin, { eventId: `${submittedEventId}:candidate`, recipient: email, templateType: 'job_status_update', vars: { candidate_name: fullName, job_title: jobTitle, company_name: companyName, application_status: 'Submitted' }, metadata: { applicationId, recipientUid: req.user.uid } });
            const employerEmail = String(employerUser?.data()?.email || '').trim().toLowerCase();
            if (employerEmail) queueEmailInTransaction(transaction, requestDb, admin, { eventId: `${submittedEventId}:employer`, recipient: employerEmail, templateType: 'job_application_received', vars: { candidate_name: fullName, job_title: jobTitle, company_name: companyName, date: new Date().toLocaleDateString('en-IN') }, metadata: { applicationId, recipientUid: job.employerId } });
            transaction.set(requestDb.collection('notifications').doc(req.user.uid).collection('userNotifications').doc(submittedEventId), {
                eventId: submittedEventId, state: 'NOTIFICATION_CREATED', deliveryState: 'NOT_REQUESTED',
                type: 'job_application', title: 'Application submitted', message: `Your application for ${jobTitle} at ${companyName} was submitted.`,
                data: { jobId, applicationId, jobTitle, company: companyName }, read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            if (job.employerId) transaction.set(requestDb.collection('notifications').doc(job.employerId).collection('userNotifications').doc(submittedEventId), {
                eventId: submittedEventId, state: 'NOTIFICATION_CREATED', deliveryState: 'NOT_REQUESTED',
                type: 'job_application_received', title: 'New job application', message: `${fullName} applied for ${jobTitle}.`,
                data: { jobId, applicationId, jobTitle }, read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            transaction.set(requestDb.collection('security_audit_logs').doc(), {
                action: 'JOB_APPLICATION_SUBMITTED', actorUid: req.user.uid, jobId, applicationId,
                requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            responseData = { applicationId, revision: 1 };
        });
        return res.status(201).json({ success: true, ...responseData });
    } catch (error) {
        const status = error.code === 'ALREADY_APPLIED' ? 409 : ['JOB_UNAVAILABLE', 'RESUME_NOT_FOUND'].includes(error.code) ? 404 : error.code === 'RESUME_TOO_LARGE' ? 413 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to submit application.' : error.message });
    }
});

app.patch('/api/job-applications/:applicationId/status', async (req, res) => {
    const requestDb = req.app.get('db');
    const applicationId = String(req.params.applicationId || '');
    const status = String(req.body?.status || '').toLowerCase();
    const notes = String(req.body?.notes || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 1000);
    const expectedStatus = String(req.body?.expectedStatus || '');
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!requestDb || !admin || !/^[A-Za-z0-9:_-]{1,300}$/.test(applicationId) || !['interview', 'accepted', 'rejected'].includes(status)
        || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid application status request.' });
    const allowedTransitions = { pending: new Set(['interview', 'rejected']), interview: new Set(['accepted', 'rejected']) };
    try {
        let responseData;
        await requestDb.runTransaction(async transaction => {
            const applicationRef = requestDb.collection('jobApplications').doc(applicationId);
            const applicationSnapshot = await transaction.get(applicationRef);
            if (!applicationSnapshot.exists) { const missing = new Error('Application not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            const application = applicationSnapshot.data() || {};
            const jobRef = requestDb.collection('jobs').doc(application.jobId);
            const jobSnapshot = await transaction.get(jobRef);
            if (!jobSnapshot.exists || jobSnapshot.data()?.employerId !== req.user.uid) { const missing = new Error('Application not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            const currentStatus = String(application.status || 'pending');
            const currentRevision = Number(application.revision || 0);
            if ((expectedStatus && expectedStatus !== currentStatus) || expectedRevision !== currentRevision) { const conflict = new Error('This application changed after the list loaded. Refresh before updating it.'); conflict.code = 'APPLICATION_CHANGED'; throw conflict; }
            if (!allowedTransitions[currentStatus]?.has(status)) { const transition = new Error(`An application cannot move from ${currentStatus} to ${status}.`); transition.code = 'INVALID_STATUS_TRANSITION'; throw transition; }
            const job = jobSnapshot.data() || {};
            const jobTitle = String(job.title || application.jobSnapshot?.title || 'Job').replace(/\p{Cc}/gu, ' ').slice(0, 160);
            const companyName = String(job.company || application.jobSnapshot?.company || 'Company').replace(/\p{Cc}/gu, ' ').slice(0, 160);
            const nextRevision = currentRevision + 1;
            transaction.update(applicationRef, { status, employerNotes: notes, revision: nextRevision, statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            const notification = jobApplicationNotification(status, jobTitle, companyName, notes);
            const statusEventId = notificationEventId('job_application_status', applicationId, String(nextRevision));
            if (application.applicantEmail) queueEmailInTransaction(transaction, requestDb, admin, { eventId: `${statusEventId}:candidate`, recipient: application.applicantEmail, templateType: 'job_status_update', vars: { candidate_name: application.applicantName || 'Candidate', job_title: jobTitle, company_name: companyName, application_status: status }, metadata: { applicationId, recipientUid: application.userId, revision: nextRevision } });
            transaction.set(requestDb.collection('notifications').doc(application.userId).collection('userNotifications').doc(statusEventId), {
                eventId: statusEventId, state: 'NOTIFICATION_CREATED', deliveryState: 'NOT_REQUESTED',
                ...notification, data: { jobId: application.jobId, applicationId, jobTitle, company: companyName, status }, read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            transaction.set(requestDb.collection('security_audit_logs').doc(), {
                action: 'JOB_APPLICATION_STATUS_UPDATED', actorUid: req.user.uid, applicationId, jobId: application.jobId,
                previousStatus: currentStatus, status, revision: nextRevision, requestId: res.locals.requestId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            responseData = { status, revision: nextRevision };
        });
        return res.json({ success: true, ...responseData });
    } catch (error) {
        const responseStatus = error.code === 'APPLICATION_CHANGED' ? 409 : error.code === 'INVALID_STATUS_TRANSITION' ? 400 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(responseStatus).json({ success: false, code: error.code, error: responseStatus === 500 ? 'Unable to update application.' : error.message });
    }
});

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

app.post('/api/employer/companies', async (req, res) => {
    const requestDb = req.app.get('db');
    if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
    if (!requestDb || !admin) return res.status(503).json({ success: false, error: 'Company service unavailable.' });
    try {
        const data = normalizeEmployerCompanyInput(req.body?.data);
        const reference = requestDb.collection('companies').doc();
        const batch = requestDb.batch();
        batch.set(reference, { ...data, employerId: req.user.uid, status: 'pending', featured: false, revision: 1, stats: { totalJobs: 0, activeJobs: 0, expiredJobs: 0, totalApplications: 0, lastJobPosted: null }, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.set(requestDb.collection('security_audit_logs').doc(), { action: 'EMPLOYER_COMPANY_CREATED', actorUid: req.user.uid, companyId: reference.id, revision: 1, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        return res.status(201).json({ success: true, companyId: reference.id, status: 'pending', revision: 1 });
    } catch (error) { return res.status(400).json({ success: false, error: error.message || 'Unable to create company.' }); }
});

app.patch('/api/employer/companies/:companyId', async (req, res) => {
    const requestDb = req.app.get('db');
    const companyId = String(req.params.companyId || '');
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
    if (!requestDb || !admin || !/^[A-Za-z0-9_-]{1,128}$/.test(companyId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid company update.' });
    try {
        let revision;
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('companies').doc(companyId);
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists || snapshot.data()?.employerId !== req.user.uid) { const missing = new Error('Company not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            const currentRevision = Number(snapshot.data()?.revision || 0);
            if (currentRevision !== expectedRevision) { const conflict = new Error('This company changed after the dashboard loaded. Refresh before saving.'); conflict.code = 'EMPLOYER_COMPANY_CHANGED'; throw conflict; }
            revision = currentRevision + 1;
            transaction.update(reference, { ...normalizeEmployerCompanyInput(req.body?.data), status: 'pending', featured: false, revision, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'EMPLOYER_COMPANY_EDITED', actorUid: req.user.uid, companyId, revision, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true, status: 'pending', featured: false, revision });
    } catch (error) {
        const status = error.code === 'EMPLOYER_COMPANY_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : 400;
        return res.status(status).json({ success: false, code: error.code, error: error.message || 'Unable to update company.' });
    }
});

app.delete('/api/employer/companies/:companyId', async (req, res) => {
    const requestDb = req.app.get('db');
    const companyId = String(req.params.companyId || '');
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
    if (!requestDb || !admin || !/^[A-Za-z0-9_-]{1,128}$/.test(companyId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid company deletion.' });
    try {
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('companies').doc(companyId);
            const jobsQuery = requestDb.collection('jobs').where('companyId', '==', companyId).limit(1);
            const [snapshot, jobs] = await Promise.all([transaction.get(reference), transaction.get(jobsQuery)]);
            if (!snapshot.exists || snapshot.data()?.employerId !== req.user.uid) { const missing = new Error('Company not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            if (Number(snapshot.data()?.revision || 0) !== expectedRevision) { const conflict = new Error('This company changed after the dashboard loaded. Refresh before deleting.'); conflict.code = 'EMPLOYER_COMPANY_CHANGED'; throw conflict; }
            if (!jobs.empty) { const conflict = new Error('Delete or archive this company’s jobs before deleting the company.'); conflict.code = 'COMPANY_HAS_JOBS'; throw conflict; }
            transaction.delete(reference);
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'EMPLOYER_COMPANY_DELETED', actorUid: req.user.uid, companyId, revision: expectedRevision, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true });
    } catch (error) {
        const status = ['EMPLOYER_COMPANY_CHANGED', 'COMPANY_HAS_JOBS'].includes(error.code) ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete company.' : error.message });
    }
});

app.post('/api/employer/jobs', async (req, res) => {
    const requestDb = req.app.get('db');
    if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
    const companyId = String(req.body?.data?.companyId || '');
    if (!requestDb || !admin || !/^[A-Za-z0-9_-]{1,128}$/.test(companyId)) return res.status(400).json({ success: false, error: 'Select an approved company.' });
    try {
        const companySnapshot = await requestDb.collection('companies').doc(companyId).get();
        if (!companySnapshot.exists || companySnapshot.data()?.employerId !== req.user.uid || companySnapshot.data()?.status !== 'approved') return res.status(404).json({ success: false, error: 'Approved company not found.' });
        const data = normalizeEmployerJobInput(req.body.data, { id: companyId, ...companySnapshot.data() });
        const reference = requestDb.collection('jobs').doc();
        const batch = requestDb.batch();
        batch.set(reference, { ...data, employerId: req.user.uid, status: 'pending', revision: 1, applicationsCount: 0, viewsCount: 0, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.set(requestDb.collection('security_audit_logs').doc(), { action: 'EMPLOYER_JOB_CREATED', actorUid: req.user.uid, jobId: reference.id, companyId, revision: 1, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        return res.status(201).json({ success: true, jobId: reference.id, status: 'pending', revision: 1 });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message || 'Unable to create job.' });
    }
});

app.patch('/api/employer/jobs/:jobId', async (req, res) => {
    const requestDb = req.app.get('db');
    const jobId = String(req.params.jobId || '');
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
    if (!requestDb || !admin || !/^[A-Za-z0-9_-]{1,128}$/.test(jobId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid job update.' });
    try {
        let result;
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('jobs').doc(jobId);
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists || snapshot.data()?.employerId !== req.user.uid) { const missing = new Error('Job not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            const current = snapshot.data() || {};
            const revision = Number(current.revision || 0);
            if (revision !== expectedRevision) { const conflict = new Error('This job changed after the dashboard loaded. Refresh before saving.'); conflict.code = 'EMPLOYER_JOB_CHANGED'; throw conflict; }
            let changes;
            let action;
            if (Object.hasOwn(req.body || {}, 'status')) {
                const nextStatus = String(req.body.status || '').toLowerCase();
                const allowed = (current.status === 'active' && nextStatus === 'paused') || (current.status === 'paused' && nextStatus === 'active');
                if (!allowed) { const invalid = new Error(`A ${current.status || 'pending'} job cannot be changed to ${nextStatus}.`); invalid.code = 'INVALID_JOB_TRANSITION'; throw invalid; }
                changes = { status: nextStatus };
                action = 'EMPLOYER_JOB_STATUS_CHANGED';
            } else {
                const companyId = String(req.body?.data?.companyId || '');
                const companyRef = requestDb.collection('companies').doc(companyId);
                const company = await transaction.get(companyRef);
                if (!company.exists || company.data()?.employerId !== req.user.uid || company.data()?.status !== 'approved') { const missing = new Error('Approved company not found.'); missing.code = 'COMPANY_NOT_FOUND'; throw missing; }
                changes = { ...normalizeEmployerJobInput(req.body.data, { id: companyId, ...company.data() }), status: 'pending' };
                action = 'EMPLOYER_JOB_EDITED';
            }
            const nextRevision = revision + 1;
            transaction.update(reference, { ...changes, revision: nextRevision, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action, actorUid: req.user.uid, jobId, revision: nextRevision, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            result = { ...changes, revision: nextRevision };
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        const status = error.code === 'EMPLOYER_JOB_CHANGED' ? 409 : ['NOT_FOUND', 'COMPANY_NOT_FOUND'].includes(error.code) ? 404 : error.code === 'INVALID_JOB_TRANSITION' ? 400 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to update job.' : error.message });
    }
});

app.delete('/api/employer/jobs/:jobId', async (req, res) => {
    const requestDb = req.app.get('db');
    const jobId = String(req.params.jobId || '');
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
    if (!requestDb || !admin || !/^[A-Za-z0-9_-]{1,128}$/.test(jobId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid job deletion.' });
    try {
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('jobs').doc(jobId);
            const applicationsQuery = requestDb.collection('jobApplications').where('jobId', '==', jobId).limit(1);
            const [snapshot, applications] = await Promise.all([transaction.get(reference), transaction.get(applicationsQuery)]);
            if (!snapshot.exists || snapshot.data()?.employerId !== req.user.uid) { const missing = new Error('Job not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            if (Number(snapshot.data()?.revision || 0) !== expectedRevision) { const conflict = new Error('This job changed after the dashboard loaded. Refresh before deleting.'); conflict.code = 'EMPLOYER_JOB_CHANGED'; throw conflict; }
            if (!applications.empty) { const conflict = new Error('This job has applications and cannot be deleted. Pause it instead.'); conflict.code = 'JOB_HAS_APPLICATIONS'; throw conflict; }
            transaction.delete(reference);
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'EMPLOYER_JOB_DELETED', actorUid: req.user.uid, jobId, revision: expectedRevision, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true });
    } catch (error) {
        const status = ['EMPLOYER_JOB_CHANGED', 'JOB_HAS_APPLICATIONS'].includes(error.code) ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete job.' : error.message });
    }
});

app.post('/api/messages/conversations', async (req, res) => {
    const applicationId = String(req.body.applicationId || '');
    if (!/^[A-Za-z0-9:_-]{1,300}$/.test(applicationId) || !db || !admin?.database) {
        return res.status(400).json({ success: false, error: 'Valid job application is required.' });
    }
    try {
        const application = await db.collection('jobApplications').doc(applicationId).get();
        if (!application.exists) return res.status(404).json({ success: false, error: 'Job application not found.' });
        const applicationData = application.data();
        const job = await db.collection('jobs').doc(applicationData.jobId).get();
        const applicantUid = applicationData.userId;
        const employerUid = job.data()?.employerId;
        if (!applicantUid || !employerUid || ![applicantUid, employerUid].includes(req.user.uid)) {
            return res.status(403).json({ success: false, error: 'Conversation is not available to this account.' });
        }
        const participants = [applicantUid, employerUid].sort();
        const lookupKey = crypto.createHash('sha256').update(participants.join('\0')).digest('hex');
        const realtime = admin.database();
        const lookupRef = realtime.ref(`conversation-participants/${lookupKey}`);
        const existing = await lookupRef.get();
        const existingId = String(existing.val() || '');
        if (existing.exists() && /^[A-Za-z0-9_-]{1,128}$/.test(existingId)) {
            return res.json({ success: true, conversationId: existingId, existing: true });
        }
        // A deterministic first ID makes concurrent create requests idempotent. Legacy
        // random IDs remain available through the protected lookup above.
        const conversationId = lookupKey;
        const timestamp = { '.sv': 'timestamp' };
        await realtime.ref().update({
            [`conversations/${conversationId}`]: {
                participants: { [applicantUid]: true, [employerUid]: true },
                applicationId,
                createdAt: timestamp
            },
            [`user-conversations/${applicantUid}/${conversationId}`]: true,
            [`user-conversations/${employerUid}/${conversationId}`]: true,
            [`conversation-participants/${lookupKey}`]: conversationId
        });
        return res.status(201).json({ success: true, conversationId });
    } catch (error) {
        console.error('[Create conversation]', error.message);
        return res.status(503).json({ success: false, error: 'Messaging service unavailable.' });
    }
});

app.get('/api/messages/conversations/:conversationId/participant-profile', async (req, res) => {
    const conversationId = String(req.params.conversationId || '');
    const requestDb = req.app.get('db');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(conversationId) || !requestDb || !admin?.database) {
        return res.status(404).json({ success: false, error: 'Conversation not found.' });
    }
    try {
        const conversation = await admin.database().ref(`conversations/${conversationId}`).get();
        if (!conversation.exists() || conversation.child(`participants/${req.user.uid}`).val() !== true) {
            return res.status(404).json({ success: false, error: 'Conversation not found.' });
        }
        const participantIds = Object.keys(conversation.child('participants').val() || {});
        const otherUserId = participantIds.find(uid => uid !== req.user.uid);
        if (!otherUserId) return res.status(404).json({ success: false, error: 'Participant not found.' });
        if (otherUserId.startsWith('deleted_')) {
            res.setHeader('Cache-Control', 'no-store, private');
            return res.json({ success: true, profile: { name: 'Deleted account', avatar: '' } });
        }
        const userSnapshot = await requestDb.collection('users').doc(otherUserId).get();
        const user = userSnapshot.data() || {};
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
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(conversationId) || !text || text.length > 10_000 || !admin?.database) {
        return res.status(400).json({ success: false, error: 'Valid conversation and message are required.' });
    }
    try {
        const realtime = admin.database();
        const conversation = await realtime.ref(`conversations/${conversationId}`).get();
        if (!conversation.exists() || conversation.child(`participants/${req.user.uid}`).val() !== true) {
            return res.status(404).json({ success: false, error: 'Conversation not found.' });
        }
        const messageRef = realtime.ref(`messages/${conversationId}`).push();
        await messageRef.set({ senderId: req.user.uid, text, timestamp: { '.sv': 'timestamp' } });
        let notificationState = 'NOTIFICATION_CREATED';
        const recipientUid = Object.keys(conversation.child('participants').val() || {}).find(uid => uid !== req.user.uid && !uid.startsWith('deleted_'));
        if (recipientUid && req.app.get('db')) {
            try {
                const eventId = notificationEventId('message', conversationId, messageRef.key);
                await req.app.get('db').collection('notifications').doc(recipientUid).collection('userNotifications').doc(eventId).set({
                    eventId, state: 'NOTIFICATION_CREATED', deliveryState: 'NOT_REQUESTED', type: 'message', title: 'New message', message: 'You have a new message.',
                    data: { conversationId }, read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            } catch { notificationState = 'NOTIFICATION_CREATION_FAILED'; }
        } else notificationState = 'NOTIFICATION_CREATION_FAILED';
        return res.status(201).json({ success: true, messageId: messageRef.key, notificationState });
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
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Contact service unavailable.' });
    await db.collection('contact').add({
        email, name, message, status: 'new',
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(202).json({ success: true, message: 'Message accepted.' });
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
        const data = await consumeExportRenderToken(req.app.get('db'), req.query.token);
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
        const requestDb = req.app.get('db');
        if (!requestDb) return res.status(503).json({ error: 'Export authorization unavailable' });

        let stored;
        let ownerUid;
        // This handler is mounted at application level, so req.path is the full
        // '/api/public-export'. Matching the suffix keeps the public branch correct
        // regardless of whether the route is reached directly or through a mount.
        if (req.path.endsWith('/public-export')) {
            const publishedSnap = await requestDb.collection('pb').doc(resumeId).get();
            const published = publishedSnap.data();
            if (!publishedSnap.exists || published?.isPublished !== true || published?.publicationMode !== 'explicit') return res.status(404).json({ error: 'Resume not found' });
            ownerUid = published.ownerUid;
            try { stored = JSON.parse(published.object); } catch { return res.status(422).json({ error: 'Resume data is invalid' }); }
        } else {
            ownerUid = req.user?.uid;
            // Cover-letter documents live in the owner-scoped 'covers' collection; CV drafts
            // live in 'resumes'. Both are owner-scoped, so ownership is enforced by the path.
            const ownerCollection = resumeName.startsWith('Cover') ? 'covers' : 'resumes';
            let privateSnap = await requestDb.collection('users').doc(ownerUid).collection(ownerCollection).doc(resumeId).get();
            if (!privateSnap.exists && ownerCollection === 'covers') {
                // Historical cover documents were saved into the resumes collection.
                privateSnap = await requestDb.collection('users').doc(ownerUid).collection('resumes').doc(resumeId).get();
            }
            if (privateSnap.exists) {
                stored = { ...privateSnap.data() };
                for (const field of ['revision', 'created_at', 'createdAt', 'updatedAt', 'ownerUid', 'userId']) delete stored[field];
            } else {
                // Migration fallback for resumes created before owner-scoped canonical drafts.
                const legacySnap = await requestDb.collection('pb').doc(resumeId).get();
                const legacy = legacySnap.data();
                if (!legacySnap.exists || legacy?.ownerUid !== ownerUid) return res.status(404).json({ error: 'Resume not found' });
                try { stored = JSON.parse(legacy.object); } catch { return res.status(422).json({ error: 'Resume data is invalid' }); }
            }
        }

        const ownerSnap = await requestDb.collection('users').doc(ownerUid).get();
        const owner = ownerSnap.data() || {};
        const membershipEnd = owner.membershipEnds?.toDate?.() || new Date(owner.membershipEnds || 0);
        const entitled = owner.membership === 'Premium'
            && ['ACTIVE', 'ADMIN_GRANTED'].includes(owner.paymentStatus)
            && membershipEnd > new Date();
        if (!entitled) {
            return res.status(402).json({ error: { code: 'ACTIVE_SUBSCRIPTION_REQUIRED', message: 'An active subscription is required for PDF export', requestId: res.locals.requestId } });
        }
        if (stored?.template && stored.template !== resumeName) return res.status(400).json({ error: 'Template mismatch' });

        // Export preferences are optional, server-side, and bounded. The public
        // host and executable binding are intentionally not read from browser
        // settings; this process always renders against its deployment origin.
        let exportPreferences = { renderTimeout: 60_000, paperFormat: 'A4' };
        try {
            const preferencesSnapshot = await requestDb.collection('data').doc('public_config').get();
            const configured = preferencesSnapshot.data()?.exportPdf || {};
            const timeout = Number(configured.renderTimeout);
            if (Number.isFinite(timeout)) exportPreferences.renderTimeout = Math.max(5_000, Math.min(Math.floor(timeout), 120_000));
            if (['A4', 'Letter', 'Legal'].includes(configured.paperFormat)) exportPreferences.paperFormat = configured.paperFormat;
        } catch (preferenceError) {
            console.warn('[Export preferences] unavailable; using bounded defaults:', preferenceError.message);
        }
        renderToken = await createExportRenderToken(req.app.get('db'), stored);
        const launchOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process', '--no-zygote']
        };
        browser = await chromium.launch(launchOptions);
        const context = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
        const allowedRenderOrigin = new URL(`${protocol}://${websiteName}`).origin;
        const allowedHosts = new Set([
            new URL(`${protocol}://${websiteName}`).hostname,
            'firebasestorage.googleapis.com',
            'storage.googleapis.com',
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
        if (renderToken) await discardExportRenderToken(req.app.get('db'), renderToken);
        if (slotAcquired) { slotAcquired = false; releaseSlot(); }
    }
});

// Import AI & Email routes
const aiRoutes = require('./routes/ai');
const emailRoutes = require('./routes/email');

// Use AI & Email routes
app.use('/api', aiRoutes);
app.use('/api', emailRoutes);
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
        return res.json(await getPaymentSettingsProjection(req.app.get('db'), process.env));
    } catch (error) {
        return res.status(Number(error.status) || 503).json({ error: { code: error.code || 'PAYMENT_SETTINGS_UNAVAILABLE', message: 'Could not load payment settings.', requestId: res.locals.requestId } });
    }
});

// AI provider configuration is split: secrets remain in a server-only document while
// browser-readable settings contain models/toggles only.
app.get('/api/admin/ai-settings', async (req, res) => {
    try {
        const result = await loadAiAdminSettings(req.app.get('db'));
        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(error.status || 503).json({ success: false, code: error.code || 'AI_SETTINGS_UNAVAILABLE', error: error.message, requestId: res.locals.requestId });
    }
});

async function publishDueBlogPosts(requestDb, { actorUid = 'cms-scheduler', requestId = null } = {}) {
    if (!requestDb || !admin) throw new Error('CMS scheduler unavailable');
    const now = new Date();
    const snapshot = await requestDb.collection('blog_posts')
        .where('status', '==', 'scheduled').where('scheduledAt', '<=', now).orderBy('scheduledAt', 'asc').limit(100).get();
    const due = snapshot.docs.filter(document => {
        const value = document.data()?.scheduledAt;
        const date = value?.toDate?.() || new Date(value || 0);
        return Number.isFinite(date.getTime()) && date <= now;
    });
    if (!due.length) return 0;
    return requestDb.runTransaction(async transaction => {
        const freshSnapshots = await Promise.all(due.map(document => transaction.get(document.ref)));
        const stillDue = freshSnapshots.filter(document => {
            if (!document.exists || document.data()?.status !== 'scheduled') return false;
            const value = document.data()?.scheduledAt;
            const date = value?.toDate?.() || new Date(value || 0);
            return Number.isFinite(date.getTime()) && date <= now;
        });
        for (const document of stillDue) {
            const post = document.data() || {};
            const revision = Number(post.revision || 0) + 1;
            transaction.update(document.ref, { status: 'approved', publishedAt: admin.firestore.FieldValue.serverTimestamp(), scheduledAt: null, revision, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            const eventId = notificationEventId('blog_scheduled_published', document.id, String(revision));
            transaction.set(requestDb.collection('notifications').doc(post.authorUid).collection('userNotifications').doc(eventId), { eventId, state: 'NOTIFICATION_CREATED', deliveryState: 'NOT_REQUESTED', type: 'blog_published', title: 'Scheduled Blog post published', message: `“${String(post.title || 'Post').slice(0, 160)}” is now public.`, data: { postId: document.id, status: 'approved', revision }, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        if (stillDue.length) transaction.set(requestDb.collection('security_audit_logs').doc(), {
            action: 'CMS_SCHEDULED_POSTS_PUBLISHED', actorUid, count: stillDue.length, requestId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return stillDue.length;
    });
}

function normalizeBlogCategoryInput(input = {}) {
    const name = String(input.name || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 120);
    const description = String(input.description || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
    const color = /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? String(input.color) : '#6366f1';
    const slug = name.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
    if (!name || !slug) throw new Error('A valid category name is required.');
    return { name, slug, description, color };
}

app.post('/api/admin/blog/categories', async (req, res) => {
    const requestDb = req.app.get('db');
    if (!requestDb || !admin) return res.status(503).json({ success: false, error: 'Category service unavailable.' });
    try {
        const data = normalizeBlogCategoryInput(req.body);
        const reference = requestDb.collection('blog_categories').doc();
        await requestDb.runTransaction(async transaction => {
            const duplicate = await transaction.get(requestDb.collection('blog_categories').where('slug', '==', data.slug).limit(1));
            if (!duplicate.empty) { const error = new Error('A category with this name already exists.'); error.code = 'CATEGORY_CONFLICT'; throw error; }
            transaction.set(reference, { ...data, revision: 1, postCount: 0, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'CMS_CATEGORY_CREATED', actorUid: req.user.uid, categoryId: reference.id, revision: 1, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.status(201).json({ success: true, categoryId: reference.id, slug: data.slug, revision: 1 });
    } catch (error) { return res.status(error.code === 'CATEGORY_CONFLICT' ? 409 : 400).json({ success: false, code: error.code, error: error.message }); }
});

app.patch('/api/admin/blog/categories/:categoryId', async (req, res) => {
    const requestDb = req.app.get('db'); const categoryId = String(req.params.categoryId || ''); const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!requestDb || !admin || !/^[A-Za-z0-9_-]{1,128}$/.test(categoryId) || !Number.isInteger(expectedRevision)) return res.status(400).json({ success: false, error: 'Invalid category update.' });
    try {
        const data = normalizeBlogCategoryInput(req.body);
        let revision;
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('blog_categories').doc(categoryId);
            const [snapshot, duplicate] = await Promise.all([transaction.get(reference), transaction.get(requestDb.collection('blog_categories').where('slug', '==', data.slug).limit(2))]);
            if (!snapshot.exists) { const e = new Error('Category not found.'); e.code = 'NOT_FOUND'; throw e; }
            if (Number(snapshot.data()?.revision || 0) !== expectedRevision) { const e = new Error('This category changed after loading. Refresh before saving.'); e.code = 'CATEGORY_CONFLICT'; throw e; }
            if (duplicate.docs.some(document => document.id !== categoryId)) { const e = new Error('A category with this name already exists.'); e.code = 'CATEGORY_CONFLICT'; throw e; }
            revision = expectedRevision + 1;
            transaction.update(reference, { ...data, revision, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'CMS_CATEGORY_UPDATED', actorUid: req.user.uid, categoryId, revision, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true, slug: data.slug, revision });
    } catch (error) { const status = error.code === 'CATEGORY_CONFLICT' ? 409 : error.code === 'NOT_FOUND' ? 404 : 400; return res.status(status).json({ success: false, code: error.code, error: error.message }); }
});

app.delete('/api/admin/blog/categories/:categoryId', async (req, res) => {
    const requestDb = req.app.get('db'); const categoryId = String(req.params.categoryId || ''); const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!requestDb || !admin || !/^[A-Za-z0-9_-]{1,128}$/.test(categoryId) || !Number.isInteger(expectedRevision)) return res.status(400).json({ success: false, error: 'Invalid category deletion.' });
    try {
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('blog_categories').doc(categoryId);
            const [snapshot, posts] = await Promise.all([transaction.get(reference), transaction.get(requestDb.collection('blog_posts').where('categoryId', '==', categoryId).limit(1))]);
            if (!snapshot.exists) { const e = new Error('Category not found.'); e.code = 'NOT_FOUND'; throw e; }
            if (Number(snapshot.data()?.revision || 0) !== expectedRevision) { const e = new Error('This category changed after loading. Refresh before deleting.'); e.code = 'CATEGORY_CONFLICT'; throw e; }
            if (!posts.empty) { const e = new Error('Move or delete posts before deleting this category.'); e.code = 'CATEGORY_HAS_POSTS'; throw e; }
            transaction.delete(reference);
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'CMS_CATEGORY_DELETED', actorUid: req.user.uid, categoryId, revision: expectedRevision, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true });
    } catch (error) { const status = ['CATEGORY_CONFLICT', 'CATEGORY_HAS_POSTS'].includes(error.code) ? 409 : error.code === 'NOT_FOUND' ? 404 : 500; return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete category.' : error.message }); }
});

app.patch('/api/admin/blog/posts/:postId', async (req, res) => {
    const requestDb = req.app.get('db');
    const postId = String(req.params.postId || '');
    const nextStatus = String(req.body?.status || '').toLowerCase();
    const expectedRevision = Number(req.body?.expectedRevision);
    const scheduledAt = req.body?.scheduledAt ? new Date(req.body.scheduledAt) : null;
    if (!requestDb || !admin || !/^[A-Za-z0-9_-]{1,128}$/.test(postId) || !['approved', 'rejected', 'scheduled'].includes(nextStatus) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid Blog moderation request.' });
    if (nextStatus === 'scheduled' && (!scheduledAt || !Number.isFinite(scheduledAt.getTime()) || scheduledAt <= new Date())) return res.status(400).json({ success: false, error: 'Choose a future publication time.' });
    try {
        let result;
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('blog_posts').doc(postId);
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) { const missing = new Error('Post not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            const post = snapshot.data() || {};
            const revision = Number(post.revision || 0);
            if (revision !== expectedRevision) { const conflict = new Error('This post changed after moderation loaded. Refresh before continuing.'); conflict.code = 'BLOG_CONFLICT'; throw conflict; }
            const allowed = nextStatus === 'rejected' || ((nextStatus === 'approved' || nextStatus === 'scheduled') && ['draft', 'pending', 'rejected'].includes(post.status));
            if (!allowed) { const invalid = new Error(`A ${post.status} post cannot transition to ${nextStatus}.`); invalid.code = 'INVALID_BLOG_TRANSITION'; throw invalid; }
            const nextRevision = revision + 1;
            const changes = { status: nextStatus, revision: nextRevision, updatedAt: admin.firestore.FieldValue.serverTimestamp(), scheduledAt: nextStatus === 'scheduled' ? scheduledAt : null };
            if (nextStatus === 'approved') changes.publishedAt = admin.firestore.FieldValue.serverTimestamp();
            transaction.update(reference, changes);
            const eventId = notificationEventId('blog_moderation', postId, String(nextRevision));
            transaction.set(requestDb.collection('notifications').doc(post.authorUid).collection('userNotifications').doc(eventId), { eventId, state: 'NOTIFICATION_CREATED', deliveryState: 'NOT_REQUESTED', type: 'blog_moderation', title: nextStatus === 'approved' ? 'Blog post published' : nextStatus === 'scheduled' ? 'Blog post scheduled' : 'Blog post returned for revision', message: `“${String(post.title || 'Post').slice(0, 160)}” is now ${nextStatus}.`, data: { postId, status: nextStatus, revision: nextRevision }, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: `CMS_BLOG_${nextStatus.toUpperCase()}`, actorUid: req.user.uid, postId, revision: nextRevision, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            result = { status: nextStatus, revision: nextRevision };
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        const status = error.code === 'BLOG_CONFLICT' ? 409 : error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_BLOG_TRANSITION' ? 400 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to moderate post.' : error.message });
    }
});

app.delete('/api/admin/blog/posts/:postId', async (req, res) => {
    const requestDb = req.app.get('db');
    const postId = String(req.params.postId || '');
    const expectedRevision = Number(req.body?.expectedRevision);
    if (!requestDb || !admin || !/^[A-Za-z0-9_-]{1,128}$/.test(postId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid Blog deletion.' });
    try {
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('blog_posts').doc(postId);
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) { const missing = new Error('Post not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            if (Number(snapshot.data()?.revision || 0) !== expectedRevision) { const conflict = new Error('This post changed before deletion. Refresh and confirm again.'); conflict.code = 'BLOG_CONFLICT'; throw conflict; }
            transaction.delete(reference);
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'CMS_BLOG_DELETED', actorUid: req.user.uid, postId, revision: expectedRevision, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true });
    } catch (error) {
        const status = error.code === 'BLOG_CONFLICT' ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete post.' : error.message });
    }
});

app.post('/api/admin/blog/publish-due', async (req, res) => {
    // The datastore is the only dependency this scheduler has. Checking it up
    // front lets us report "not configured" precisely, instead of letting every
    // possible fault collapse into one opaque "unavailable" message.
    if (!req.app.get('db')) {
        return res.status(503).json({
            success: false,
            code: 'CMS_SCHEDULER_NOT_CONFIGURED',
            configurationState: 'NOT_CONFIGURED',
            error: 'The CMS scheduler requires Firestore, which is not configured on this deployment.',
            remediation: 'Provide Firebase service-account credentials so the backend can reach Firestore.',
        });
    }
    try {
        const published = await publishDueBlogPosts(req.app.get('db'), { actorUid: req.user.uid, requestId: res.locals.requestId });
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
    const requestDb = req.app.get('db');
    const firebaseAdmin = req.app.get('firebaseAdmin') || admin;
    if (!requestDb || !firebaseAdmin) return res.status(503).json({ success: false, code: 'HEALTH_UNAVAILABLE', error: 'Health services unavailable.' });
    try {
        const [publicConfig, aiProviders, paymentProviders] = await Promise.all([
            requestDb.collection('data').doc('public_config').get(),
            requestDb.collection('settings').doc('ai_providers').get(),
            requestDb.collection('settings').doc('payment_providers').get(),
        ]);
        const publicData = publicConfig.data() || {};
        const ai = aiProviders.data() || {};
        const payments = paymentProviders.data() || {};
        return res.json({
            success: true,
            checkedAt: new Date().toISOString(),
            revision: Number(publicData._settingsRevisions?.systemHealth || 0),
            services: {
                backend: { reachable: true }, firebaseAdmin: { configured: true },
                aiProviders: Object.fromEntries(['gemini', 'nvidia', 'openai', 'groq', 'openrouter', 'deepseek'].map(provider => [provider, { configured: Boolean(ai[provider]?.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`]) }])),
                payments: {
                    stripe: { configured: Boolean(payments.stripe?.secretKey || process.env.STRIPE_SECRET) },
                    razorpay: { configured: Boolean((payments.razorpay?.keyId && payments.razorpay?.keySecret) || (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)) },
                },
            },
            settings: publicData.systemHealth || { maintenanceMode: false, maintenanceMessage: '' },
        });
    } catch (error) {
        console.error('[Admin health summary]', error.message);
        return res.status(503).json({ success: false, code: 'HEALTH_UNAVAILABLE', error: 'Unable to read service health configuration.' });
    }
});

app.post('/api/admin/system-health-settings', requireRecentAdminAuthentication, async (req, res) => {
    const requestDb = req.app.get('db');
    const firebaseAdmin = req.app.get('firebaseAdmin') || admin;
    if (!requestDb || !firebaseAdmin?.firestore?.FieldValue) return res.status(503).json({ success: false, code: 'SETTINGS_UNAVAILABLE', error: 'Settings service unavailable.' });
    const maintenanceMode = req.body?.maintenanceMode === true;
    const maintenanceMessage = String(req.body?.maintenanceMessage || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
    if (maintenanceMode && !maintenanceMessage) return res.status(400).json({ success: false, code: 'INVALID_MAINTENANCE_MESSAGE', error: 'A maintenance message is required while maintenance mode is enabled.' });
    const systemHealth = { maintenanceMode, maintenanceMessage };
    try {
        const publicRef = requestDb.collection('data').doc('public_config');
        const maintenanceRef = requestDb.collection('settings').doc('maintenance');
        const revision = await requestDb.runTransaction(async transaction => {
            const [publicSnapshot, maintenanceSnapshot] = await Promise.all([transaction.get(publicRef), transaction.get(maintenanceRef)]);
            const currentPublic = publicSnapshot.data() || {};
            const currentMaintenance = maintenanceSnapshot.data() || {};
            const currentRevision = Number(currentPublic._settingsRevisions?.systemHealth || currentMaintenance._revision || 0);
            const expectedRevision = req.body?.expectedRevision === undefined ? currentRevision : Number(req.body.expectedRevision);
            if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) {
                const conflict = new Error('Health settings changed after this panel loaded. Refresh before saving.');
                conflict.code = 'ADMIN_SETTINGS_CONFLICT';
                throw conflict;
            }
            const nextRevision = currentRevision + 1;
            const timestamp = firebaseAdmin.firestore.FieldValue.serverTimestamp();
            transaction.set(maintenanceRef, {
                enabled: maintenanceMode, message: maintenanceMessage,
                updatedBy: req.user?.email || req.user?.uid || 'admin', updatedAt: timestamp, _revision: nextRevision,
            }, { merge: true });
            transaction.set(publicRef, { systemHealth, _settingsRevisions: { systemHealth: nextRevision } }, { merge: true });
            transaction.set(requestDb.collection('security_audit_logs').doc(), {
                action: 'SYSTEM_HEALTH_SETTINGS_UPDATED', actorUid: req.user.uid, maintenanceMode,
                revision: nextRevision, requestId: res.locals.requestId, createdAt: timestamp,
            });
            return nextRevision;
        });
        return res.json({ success: true, settings: systemHealth, revision });
    } catch (error) {
        const status = error.code === 'ADMIN_SETTINGS_CONFLICT' ? 409 : 500;
        return res.status(status).json({ success: false, code: error.code || 'SYSTEM_HEALTH_SETTINGS_SAVE_FAILED', error: status === 409 ? error.message : 'Unable to save system health settings.', requestId: res.locals.requestId });
    }
});

const GENERIC_ADMIN_SETTING_CATEGORIES = new Set([
    'modules', 'auth', 'blog', 'watermark', 'templateManager', 'security', 'jobScraper',
    'exportPdf', 'branding', 'geoSeo', 'llmGeo', 'enabledTemplates', 'integrations',
    'socialAuth', 'google', 'facebook', 'smtp', 'fallbackSmtp', 'imap',
    'storage', 'codeInjection', 'gdpr'
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
        // The caller replaces this marker with a Firestore delete sentinel before
        // persisting. Keeping the marker in this pure helper makes the intent
        // testable without requiring a Firebase SDK instance.
        target[leaf] = { __adminSecretDelete: true };
    }
    return output;
}

function materializeAdminSecretDeletes(value, admin) {
    if (Array.isArray(value)) return value.map(item => materializeAdminSecretDeletes(item, admin));
    if (!value || typeof value !== 'object') return value;
    if (value.__adminSecretDelete === true && Object.keys(value).length === 1) return admin.firestore.FieldValue.delete();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materializeAdminSecretDeletes(item, admin)]));
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
    const requestDb = req.app.get('db');
    if (!requestDb) return res.status(503).json({ success: false, code: 'SETTINGS_UNAVAILABLE', error: 'Settings service unavailable.', requestId: res.locals.requestId });
    try {
        const [publicSnapshot, adminSnapshot] = await Promise.all([
            requestDb.collection('data').doc('public_config').get(),
            requestDb.collection('settings').doc('admin_configuration').get(),
        ]);
        const publicRoot = publicSnapshot.data() || {};
        const adminRoot = adminSnapshot.data() || {};
        const settings = {};
        for (const [category, data] of Object.entries(publicRoot)) {
            if (category.startsWith('_')) continue;
            settings[category] = publicAdminSettings(category, data || {});
        }
        for (const [category, data] of Object.entries(adminRoot)) {
            if (category.startsWith('_') || Object.hasOwn(settings, category)) continue;
            settings[category] = publicAdminSettings(category, data || {});
        }
        return res.json({ success: true, settings, revisions: publicRoot._settingsRevisions || adminRoot._revisions || {}, generatedAt: new Date().toISOString() });
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
    if (category === 'storage' && Object.hasOwn(req.body.data, 'provider') && req.body.data.provider !== 'firebase') {
        return res.status(501).json({ success: false, code: 'STORAGE_PROVIDER_UNSUPPORTED', error: 'Only Firebase Storage is implemented by this deployment. Cloudinary and S3 require a server-side adapter before they can be enabled.' });
    }
    if (requiresRecentGenericSettingAuth(category, req.body.data, req.body.clearSecrets)) {
        const guarded = requireRecentAdminAuthentication(req, res, () => {});
        if (guarded) return guarded;
    }
    const requestDb = req.app.get('db');
    if (!requestDb || !admin) return res.status(503).json({ success: false, error: 'Settings service unavailable.' });
    try {
        if (Buffer.byteLength(JSON.stringify(req.body.data), 'utf8') > 100_000) throw new Error('Settings payload is too large.');
        const normalized = normalizeAdminSettingValue(req.body.data);
        let publicSettings;
        const rawRevision = req.body?.expectedRevision;
        const expectedRevision = rawRevision !== undefined ? Number(rawRevision) : -1;
        if (!Number.isInteger(expectedRevision) || (expectedRevision < 0 && expectedRevision !== -1)) throw new Error('Invalid settings revision.');
        const secretRef = requestDb.collection('settings').doc('admin_configuration');
        const publicRef = requestDb.collection('data').doc('public_config');
        const revision = await requestDb.runTransaction(async transaction => {
            const snapshot = await transaction.get(secretRef);
            const currentRevision = Number(snapshot.data()?._revisions?.[category] || 0);
            if (expectedRevision !== -1 && expectedRevision !== currentRevision) {
                const stale = new Error('These settings changed after the panel loaded. Refresh before saving.');
                stale.code = 'ADMIN_SETTINGS_CONFLICT';
                throw stale;
            }
            const nextRevision = currentRevision + 1;
            const currentCategory = snapshot.data()?.[category];
            const mergedInput = mergeAdminSettingCategory(currentCategory, normalized);
            const withClears = applyExplicitAdminSecretClears(category, currentCategory, mergedInput, req.body?.clearSecrets);
            const persisted = materializeAdminSecretDeletes(preserveAdminSettingSecrets(category, currentCategory, withClears), admin);
            publicSettings = publicAdminSettings(category, persisted);
            transaction.set(secretRef, { [category]: persisted, _revisions: { [category]: nextRevision } }, { merge: true });
            transaction.set(publicRef, { [category]: publicSettings, _settingsRevisions: { [category]: nextRevision } }, { merge: true });
            transaction.set(requestDb.collection('security_audit_logs').doc(), {
                action: 'ADMIN_SETTINGS_UPDATED', actorUid: req.user.uid, category, revision: nextRevision,
                changedFields: [...Object.keys(normalized), ...(Array.isArray(req.body?.clearSecrets) ? req.body.clearSecrets : Object.entries(req.body?.clearSecrets || {}).filter(([, value]) => value === true).map(([key]) => `clear:${key}`))].slice(0, 200), requestId: res.locals.requestId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return nextRevision;
        });
        return res.json({ success: true, settings: publicSettings, revision, message: `${category} settings saved.` });
    } catch (error) {
        return res.status(error.code === 'ADMIN_SETTINGS_CONFLICT' ? 409 : 400).json({ success: false, code: error.code, error: error.message });
    }
});

app.post('/api/admin/gdpr-settings', async (req, res) => {
    const requestDb = req.app.get('db');
    const firebaseAdmin = req.app.get('firebaseAdmin') || admin;
    if (!requestDb || !firebaseAdmin?.firestore?.FieldValue) return res.status(503).json({ success: false, code: 'SETTINGS_UNAVAILABLE', error: 'Settings service unavailable.' });
    const input = req.body || {};
    const safePath = (value, fallback) => {
        const pathValue = String(value || fallback).trim();
        return /^\/[A-Za-z0-9/_-]{1,200}$/.test(pathValue) ? pathValue : fallback;
    };
    const gdpr = {
        enableCookieBanner: input.enableCookieBanner !== false,
        cookieMessage: String(input.cookieMessage || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500),
        buttonText: String(input.buttonText || 'Allow analytics').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80),
        privacyPolicyUrl: safePath(input.privacyPolicyUrl, '/p/privacy-policy'),
        termsOfServiceUrl: safePath(input.termsOfServiceUrl, '/p/terms-of-service'),
    };
    try {
        const publicRef = requestDb.collection('data').doc('public_config');
        const revision = await requestDb.runTransaction(async transaction => {
            const snapshot = await transaction.get(publicRef);
            const current = snapshot.data() || {};
            const currentRevision = Number(current._settingsRevisions?.gdpr || 0);
            const requestedRevision = input.expectedRevision === undefined ? currentRevision : Number(input.expectedRevision);
            if (!Number.isInteger(requestedRevision) || requestedRevision !== currentRevision) {
                const conflict = new Error('GDPR settings changed after this panel loaded. Refresh before saving.');
                conflict.code = 'ADMIN_SETTINGS_CONFLICT';
                throw conflict;
            }
            const nextRevision = currentRevision + 1;
            transaction.set(publicRef, { gdpr, _settingsRevisions: { gdpr: nextRevision } }, { merge: true });
            transaction.set(requestDb.collection('security_audit_logs').doc(), {
                action: 'GDPR_SETTINGS_UPDATED', actorUid: req.user.uid, revision: nextRevision,
                requestId: res.locals.requestId, createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
            });
            return nextRevision;
        });
        return res.json({ success: true, settings: gdpr, revision });
    } catch (error) {
        return res.status(error.code === 'ADMIN_SETTINGS_CONFLICT' ? 409 : 500).json({ success: false, code: error.code || 'GDPR_SETTINGS_SAVE_FAILED', error: error.code === 'ADMIN_SETTINGS_CONFLICT' ? error.message : 'Unable to save GDPR settings.', requestId: res.locals.requestId });
    }
});

app.post('/api/admin/ai-settings', requireRecentAdminAuthentication, async (req, res) => {
    try {
        const result = await saveAiAdminSettings({
            db: req.app.get('db'), admin, input: req.body || {},
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
            db: req.app.get('db'), environment: process.env,
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
            db: req.app.get('db'), environment: process.env,
            provider, apiKey, fetchImpl: global.fetch, timeoutMs: 15000,
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, code: error.code || 'AI_MODELS_FETCH_FAILED', error: error.message, requestId: res.locals.requestId });
    }
});

app.get('/api/admin/ai/quota-stats', async (req, res) => {
    try {
        const targetDb = req.app.get('db');
        if (!targetDb) return res.status(503).json({ success: false, error: 'Database service unavailable' });
        const today = new Date().toISOString().slice(0, 10);

        // Load configured quota limits from Firestore
        const quotaDoc = await targetDb.collection('settings').doc('ai_quota').get();
        const quotaConfig = quotaDoc.data() || {};
        const limits = {
            basic: Number(quotaConfig.basicDailyLimit || process.env.AI_BASIC_DAILY_LIMIT || 10),
            premium: Number(quotaConfig.premiumDailyLimit || process.env.AI_PREMIUM_DAILY_LIMIT || 100),
            admin: Number(quotaConfig.adminDailyLimit || process.env.AI_ADMIN_DAILY_LIMIT || 10000),
        };

        // Load today's usage records
        const usageSnap = await targetDb.collection('ai_usage').get();
        const todayRecords = [];
        let totalRecords = 0;
        for (const doc of usageSnap.docs) {
            totalRecords++;
            const data = doc.data() || {};
            if (doc.id.startsWith(today)) {
                todayRecords.push({
                    docId: doc.id,
                    uid: data.uid || 'unknown',
                    email: data.email || '',
                    displayName: '',
                    count: Number(data.count || 0),
                    limit: Number(data.limit || 0),
                    day: data.day || today,
                    lastUsed: data.lastUsed ? (data.lastUsed.toDate ? data.lastUsed.toDate().toISOString() : data.lastUsed) : null,
                });
            }
        }

        // Enrich records with user profile data (displayName, email fallback)
        const enrichPromises = todayRecords.map(async (record) => {
            if (record.uid && record.uid !== 'unknown') {
                try {
                    const userDoc = await targetDb.collection('users').doc(record.uid).get();
                    const userData = userDoc.data() || {};
                    const nameFromParts = [userData.firstName, userData.lastName].filter(Boolean).join(' ').trim();
                    record.displayName = userData.displayName || userData.name || userData.fullName || nameFromParts || '';
                    if (!record.email) record.email = userData.email || '';
                    record.membership = userData.membership || userData.role || 'Basic';
                    record.photoURL = userData.photoURL || '';

                    // If email or displayName still missing, try Firebase Auth user record
                    if ((!record.displayName || !record.email) && admin && typeof admin.auth === 'function') {
                        try {
                            const authUser = await admin.auth().getUser(record.uid);
                            if (authUser) {
                                if (!record.displayName && authUser.displayName) record.displayName = authUser.displayName;
                                if (!record.email && authUser.email) record.email = authUser.email;
                                if (!record.photoURL && authUser.photoURL) record.photoURL = authUser.photoURL;
                            }
                        } catch (_) {}
                    }
                } catch (_) { /* user lookup optional */ }
            }
        });
        await Promise.all(enrichPromises);

        return res.json({
            success: true,
            limits,
            today,
            todayRecords: todayRecords.sort((a, b) => b.count - a.count),
            totalHistoricalRecords: totalRecords,
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message, requestId: res.locals.requestId });
    }
});

app.post('/api/admin/ai/quota-limits', async (req, res) => {
    try {
        const targetDb = req.app.get('db');
        if (!targetDb) return res.status(503).json({ success: false, error: 'Database service unavailable' });
        const { basicDailyLimit, premiumDailyLimit, adminDailyLimit } = req.body || {};
        const clamp = (v, min, max, fallback) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : fallback; };

        const update = {
            basicDailyLimit: clamp(basicDailyLimit, 1, 100000, 10),
            premiumDailyLimit: clamp(premiumDailyLimit, 1, 100000, 100),
            adminDailyLimit: clamp(adminDailyLimit, 1, 1000000, 10000),
            updatedAt: admin ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
            updatedBy: req.user?.uid || 'admin_console',
        };

        await targetDb.collection('settings').doc('ai_quota').set(update, { merge: true });
        return res.json({ success: true, limits: update, message: 'AI quota limits saved successfully.' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message, requestId: res.locals.requestId });
    }
});

app.post('/api/admin/ai/reset-quota', async (req, res) => {
    try {
        const targetDb = req.app.get('db');
        if (!targetDb) return res.status(503).json({ success: false, error: 'Database service unavailable' });
        const { uid, all } = req.body || {};
        const today = new Date().toISOString().slice(0, 10);
        let deletedCount = 0;

        if (all) {
            const snap = await targetDb.collection('ai_usage').get();
            for (const doc of snap.docs) {
                await doc.ref.delete();
                deletedCount += 1;
            }
        } else if (uid) {
            const uidHash = crypto.createHash('sha256').update(uid).digest('hex').slice(0, 40);
            const docRef = targetDb.collection('ai_usage').doc(`${today}_${uidHash}`);
            const doc = await docRef.get();
            if (doc.exists) {
                await docRef.delete();
                deletedCount = 1;
            }
        } else {
            return res.status(400).json({ success: false, error: 'Target user uid or all:true is required' });
        }

        return res.json({ success: true, deletedCount, message: `Successfully reset AI quota (${deletedCount} records deleted).` });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message, requestId: res.locals.requestId });
    }
});

app.post('/api/admin/payment-settings', requireRecentAdminAuthentication, async (req, res) => {
    const requestDb = req.app.get('db');
    const firebaseAdmin = req.app.get('firebaseAdmin') || admin;
    if (!requestDb || !firebaseAdmin?.firestore?.FieldValue) return res.status(503).json({ success: false, code: 'PAYMENT_SETTINGS_UNAVAILABLE', error: 'Payment settings service unavailable.', requestId: res.locals.requestId });
    const input = req.body || {};
    const numberInRange = (value, min, max, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
    };
    const paymentRef = requestDb.collection('settings').doc('payment_providers');
    const publicRef = requestDb.collection('data').doc('public_config');
    const [paymentSnapshot, publicSnapshot] = await Promise.all([paymentRef.get(), publicRef.get()]);
    const currentSecrets = paymentSnapshot.data() || {};
    const currentPublicRoot = publicSnapshot.data() || {};
    const currentPublic = currentPublicRoot.subscriptions || {};
    const currentRevision = Number(currentSecrets._revision || currentPublicRoot._settingsRevisions?.payments || 0);
    if (input.expectedRevision !== undefined && Number(input.expectedRevision) !== currentRevision) {
        return res.status(409).json({ success: false, code: 'PAYMENT_SETTINGS_CONFLICT', error: 'Payment settings changed after this panel loaded. Refresh before saving.', revision: currentRevision, requestId: res.locals.requestId });
    }
    const valueOrCurrent = (key, fallback = '') => {
        if (Object.hasOwn(input, key) && input[key] !== null && input[key] !== undefined && String(input[key]).trim() !== '') return input[key];
        // A blank field in the browser means "preserve". Treat an empty
        // public-config value as absent as well, so a provider identifier that
        // is stored in the server-only payment document (or deployment env)
        // cannot be erased by an unrelated settings save.
        if (currentPublic[key] !== undefined && currentPublic[key] !== null && String(currentPublic[key]).trim() !== '') return currentPublic[key];
        return fallback;
    };
    const publicSettings = {
        state: Object.hasOwn(input, 'state') ? input.state !== false : currentPublic.state !== false,
        pricingMatrix: input.pricingMatrix || currentPublic.pricingMatrix || null,
        monthlyPrice: numberInRange(valueOrCurrent('monthlyPrice', 199), 0, 1_000_000, 199),
        quartarlyPrice: numberInRange(valueOrCurrent('quartarlyPrice', 399), 0, 1_000_000, 399),
        yearlyPrice: numberInRange(valueOrCurrent('yearlyPrice', 499), 0, 1_000_000, 499),
        currency: /^[A-Z]{3}$/.test(String(valueOrCurrent('currency', 'INR')).toUpperCase()) ? String(valueOrCurrent('currency', 'INR')).toUpperCase() : 'INR',
        onlyPP: Object.hasOwn(input, 'onlyPP') ? input.onlyPP === true : currentPublic.onlyPP === true,
        sandboxMode: Object.hasOwn(input, 'sandboxMode') ? input.sandboxMode === true : currentPublic.sandboxMode === true,
        razorpayUPI: Object.hasOwn(input, 'razorpayUPI') ? input.razorpayUPI !== false : currentPublic.razorpayUPI !== false,
        ...Object.fromEntries(['stripeEnabled','paypalEnabled','razorpayEnabled','paytmEnabled','phonepeEnabled','enableTax','taxInclusive','requireCustomerTaxId'].map(key => [key, Object.hasOwn(input, key) ? input[key] === true : currentPublic[key] === true])),
        taxName: String(valueOrCurrent('taxName', 'GST')).replace(/\p{Cc}/gu, ' ').slice(0, 30),
        taxRate: numberInRange(valueOrCurrent('taxRate', 18), 0, 100, 18),
        companyTaxId: String(valueOrCurrent('companyTaxId', '')).slice(0, 30),
        supplierLegalName: String(valueOrCurrent('supplierLegalName', '')).slice(0, 150),
        supplierTradeName: String(valueOrCurrent('supplierTradeName', '')).slice(0, 150),
        supplierGstin: String(valueOrCurrent('supplierGstin', '')).slice(0, 30),
        supplierPan: String(valueOrCurrent('supplierPan', '')).slice(0, 30),
        supplierAddress: String(valueOrCurrent('supplierAddress', '')).slice(0, 500),
        supplierCity: String(valueOrCurrent('supplierCity', '')).slice(0, 100),
        supplierState: String(valueOrCurrent('supplierState', '')).slice(0, 100),
        supplierStateCode: String(valueOrCurrent('supplierStateCode', '')).slice(0, 10),
        supplierPincode: String(valueOrCurrent('supplierPincode', '')).slice(0, 20),
        sacCode: String(valueOrCurrent('sacCode', '')).slice(0, 30),
        invoicePrefix: String(valueOrCurrent('invoicePrefix', 'RPAI')).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20),
        financialYear: String(valueOrCurrent('financialYear', '')).slice(0, 20),
        receiptTemplate: ['modern','classic','minimal'].includes(valueOrCurrent('receiptTemplate', 'modern')) ? valueOrCurrent('receiptTemplate', 'modern') : 'modern',
        reverseCharge: valueOrCurrent('reverseCharge', 'No') === 'Yes' ? 'Yes' : 'No',
        stripePublishableKey: String(valueOrCurrent('stripePublishableKey', '')).slice(0, 200),
        razorpayKeyId: String(valueOrCurrent('razorpayKeyId', currentSecrets.razorpay?.keyId || process.env.RAZORPAY_KEY_ID || '')).slice(0, 100),
        paypalClientId: String(valueOrCurrent('paypalClientId', currentSecrets.paypal?.clientId || process.env.PAYPAL_CLIENT_ID || '')).slice(0, 200),
        paytmMid: String(valueOrCurrent('paytmMid', currentSecrets.paytm?.mid || process.env.PAYTM_MID || '')).slice(0, 50),
        paytmWebsite: String(valueOrCurrent('paytmWebsite', currentSecrets.paytm?.website || process.env.PAYTM_WEBSITE || 'WEBSTAGING')).slice(0, 50),
        phonepeId: String(valueOrCurrent('phonepeId', currentSecrets.phonepe?.merchantId || process.env.PHONEPE_MERCHANT_ID || '')).slice(0, 100),
        phonepeSaltIndex: String(valueOrCurrent('phonepeSaltIndex', currentSecrets.phonepe?.saltIndex || process.env.PHONEPE_SALT_INDEX || '1')).slice(0, 10),
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
    try {
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
                providerSecrets[provider] = { [persistedField]: firebaseAdmin.firestore.FieldValue.delete() };
                submittedSecrets[provider] = '';
            } else if (raw) {
                providerSecrets[provider] = { [persistedField]: raw };
                submittedSecrets[provider] = raw;
            } else {
                providerSecrets[provider] = {};
                submittedSecrets[provider] = '';
            }
        }
        // Public identifiers are safe to persist, but blank form fields preserve
        // the current value just like secrets. The runtime reads the same
        // payment_providers document, so Razorpay saves and reloads use one
        // canonical schema instead of diverging legacy paths.
        providerSecrets.paypal.clientId = publicSettings.paypalClientId;
        providerSecrets.paypal.environment = publicSettings.sandboxMode ? 'sandbox' : 'live';
        providerSecrets.razorpay.keyId = publicSettings.razorpayKeyId;
        providerSecrets.paytm.mid = publicSettings.paytmMid;
        providerSecrets.paytm.website = publicSettings.paytmWebsite;
        providerSecrets.phonepe.merchantId = publicSettings.phonepeId;
        providerSecrets.phonepe.saltIndex = publicSettings.phonepeSaltIndex;

        const nextRevision = currentRevision + 1;
        providerSecrets._revision = nextRevision;
        const batch = requestDb.batch();
        batch.set(paymentRef, providerSecrets, { merge: true });
        batch.set(publicRef, { subscriptions: publicSettings, currency: publicSettings.currency, currencySymbol: publicSettings.currency === 'INR' ? '₹' : publicSettings.currency === 'EUR' ? '€' : publicSettings.currency === 'GBP' ? '£' : '$', _settingsRevisions: { payments: nextRevision } }, { merge: true });
        // Keep data/system_settings.currency in sync with the subscription currency
        // so that getPlatformCurrencyConfig (which checks system_settings first) always
        // reflects the admin's latest currency choice.
        const sysSettingsRef = requestDb.collection('data').doc('system_settings');
        batch.set(sysSettingsRef, {
            currency: publicSettings.currency,
            currencyMeta: {
                code: publicSettings.currency,
                symbol: publicSettings.currency === 'INR' ? '₹' : publicSettings.currency === 'EUR' ? '€' : publicSettings.currency === 'GBP' ? '£' : publicSettings.currency === 'CAD' ? 'CA$' : publicSettings.currency === 'AUD' ? 'A$' : publicSettings.currency === 'JPY' ? '¥' : '$',
                name: publicSettings.currency === 'INR' ? 'Indian Rupee' : publicSettings.currency === 'EUR' ? 'Euro' : publicSettings.currency === 'GBP' ? 'British Pound' : publicSettings.currency === 'CAD' ? 'Canadian Dollar' : publicSettings.currency === 'AUD' ? 'Australian Dollar' : publicSettings.currency === 'JPY' ? 'Japanese Yen' : 'US Dollar',
            },
            currencyUpdatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
            currencyUpdatedBy: req.user?.uid || 'admin_console',
        }, { merge: true });
        batch.set(requestDb.collection('security_audit_logs').doc(), {
            action: 'PAYMENT_SETTINGS_UPDATED', actorUid: req.user?.uid || 'admin_console',
            requestId: res.locals.requestId, revision: nextRevision,
            changedSecretProviders: Object.entries(clearSecrets).filter(([, value]) => value === true).map(([key]) => key),
            createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();

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
        const status = Number(error.status) || (error.code === 'INFRASTRUCTURE_SECRET_CANNOT_CLEAR' ? 409 : 400);
        return res.status(status).json({ success: false, code: error.code || 'PAYMENT_SETTINGS_SAVE_FAILED', error: status >= 500 ? 'Unable to save payment settings.' : error.message, requestId: res.locals.requestId });
    }
});

// Admin diagnostic test-connection endpoint
app.get('/api/admin/coupons', async (req, res) => {
    const requestDb = req.app.get('db');
    if (!requestDb) return res.status(503).json({ success: false, error: 'Coupon service unavailable.' });
    const snapshot = await requestDb.collection('coupons').get();
    const coupons = snapshot.docs.filter(document => document.id !== '_meta').map(document => ({ code: document.id, ...document.data(), revision: Number(document.data()?.revision || 0) }));
    return res.json({ success: true, coupons });
});

app.put('/api/admin/coupons/:code', async (req, res) => {
    const requestDb = req.app.get('db'); const code = String(req.params.code || '').trim().toUpperCase();
    const discount = Number(req.body?.discount); const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!requestDb || !admin || !/^[A-Z0-9_-]{3,32}$/.test(code) || !Number.isFinite(discount) || discount <= 0 || discount > 100 || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid coupon request.' });
    const maxUses = Math.max(0, Math.min(1_000_000, Number(req.body?.maxUses) || 0));
    const expiryDate = String(req.body?.expiryDate || '').slice(0, 40);
    if (expiryDate && !Number.isFinite(new Date(expiryDate).getTime())) return res.status(400).json({ success: false, error: 'Invalid coupon expiry.' });
    try {
        let revision;
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('coupons').doc(code); const snapshot = await transaction.get(reference); const current = Number(snapshot.data()?.revision || 0);
            if (current !== expectedRevision) { const e = new Error('This coupon changed after the list loaded. Refresh before saving.'); e.code = 'ADMIN_TARGET_CHANGED'; throw e; }
            revision = current + 1;
            transaction.set(reference, { code, discount, description: String(req.body?.description || `${discount}% Discount`).replace(/\p{Cc}/gu, ' ').slice(0, 200), active: req.body?.active !== false, expiryDate, maxUses, singleUsePerUser: req.body?.singleUsePerUser === true, usedCount: Number(snapshot.data()?.usedCount || 0), revision, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'COUPON_SAVED', actorUid: req.user.uid, code, revision, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true, code, revision });
    } catch (error) { return res.status(error.code === 'ADMIN_TARGET_CHANGED' ? 409 : 500).json({ success: false, code: error.code, error: error.code ? error.message : 'Unable to save coupon.' }); }
});

app.delete('/api/admin/coupons/:code', async (req, res) => {
    const requestDb = req.app.get('db'); const code = String(req.params.code || '').trim().toUpperCase(); const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!requestDb || !admin || !/^[A-Z0-9_-]{3,32}$/.test(code) || !Number.isInteger(expectedRevision)) return res.status(400).json({ success: false, error: 'Invalid coupon deletion.' });
    try {
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('coupons').doc(code); const snapshot = await transaction.get(reference);
            if (!snapshot.exists) { const e = new Error('Coupon not found.'); e.code = 'NOT_FOUND'; throw e; }
            if (Number(snapshot.data()?.revision || 0) !== expectedRevision) { const e = new Error('This coupon changed after the list loaded. Refresh before deleting.'); e.code = 'ADMIN_TARGET_CHANGED'; throw e; }
            transaction.delete(reference);
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'COUPON_DELETED', actorUid: req.user.uid, code, revision: expectedRevision, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true });
    } catch (error) { const status = error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : 500; return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete coupon.' : error.message }); }
});

app.post('/api/admin/payment/test-provider', requireRecentAdminAuthentication, async (req, res) => {
    const { type, secretKey } = req.body;
    if (!['stripe', 'razorpay', 'paypal', 'paytm', 'phonepe'].includes(type)) return res.status(400).json({ success: false, code: 'PAYMENT_PROVIDER_VALIDATION_ERROR', error: 'Unsupported payment provider test.' });
    try {
        if (type === 'stripe') {
            const submitted = String(secretKey || '').trim();
            let stored = '';
            const database = req.app.get('db');
            if (database) {
                const snapshot = await database.collection('settings').doc('payment_providers').get();
                stored = String(snapshot.data()?.stripe?.secretKey || '').trim();
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
                configured = await paypalConfig(req.app.get('db'));
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
                : await getRazorpayKeys(req.app.get('db'));
            const { keyId, keySecret } = credentials;
            if (!keyId || !keySecret) {
                return res.status(503).json({ success: false, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', error: 'Razorpay is not fully configured. Add both the Key ID and Key Secret, or configure the deployment environment.' });
            }
            const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
            const rzpRes = await fetch('https://api.razorpay.com/v1/settings', {
                headers: { 'Authorization': authHeader }
            });
            const rzpData = await rzpRes.json();
            if (rzpRes.ok || rzpData.id || rzpData.profile) {
                return res.json({ success: true, message: `Razorpay connected. Mode: ${keyId.startsWith('rzp_live') ? 'LIVE' : 'TEST'}` });
            } else {
                return res.status(422).json({ success: false, code: 'PAYMENT_PROVIDER_AUTHENTICATION_FAILED', error: 'Razorpay rejected the configured credentials.' });
            }
        } else if (type === 'paytm') {
            const submittedMid = String(req.body.mid || '').trim();
            const submittedKey = String(req.body.merchantKey || '').trim();
            const configured = await getPaytmConfig(req.app.get('db'));
            const hasReplacement = submittedMid && submittedKey && !/[•*]/.test(submittedKey);
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
            const env = (process.env.PAYTM_ENV || 'staging').toLowerCase();
            return res.json({ success: true, message: `Paytm credentials validated. Env: ${env === 'production' || env === 'live' ? 'LIVE' : 'STAGING/SANDBOX'}` });
        } else if (type === 'phonepe') {
            const submittedMerchantId = String(req.body.merchantId || '').trim();
            const submittedSaltKey = String(req.body.saltKey || '').trim();
            const configured = await getPhonePeConfig(req.app.get('db'));
            const hasReplacement = submittedMerchantId && submittedSaltKey && !/[•*]/.test(submittedSaltKey);
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
            const saltIndex = parseInt(req.body.saltIndex || configured.saltIndex || '1', 10) || 1;
            const checksum = `${sha256Hash}###${saltIndex}`;
            try {
                const ppRes = await fetch(`${baseUrl}/pg/v1/status/${merchantId}/TEST_CONN`, {
                    headers: { 'X-VERIFY': checksum, 'X-MERCHANT-ID': merchantId, 'Content-Type': 'application/json' }
                });
                const ppData = await ppRes.json();
                // A 4xx with code TRANSACTION_NOT_FOUND means credentials are valid but order doesn't exist (expected)
                if (ppRes.status === 404 || ppData?.code === 'TRANSACTION_NOT_FOUND' || ppRes.status === 400) {
                    return res.json({ success: true, message: `PhonePe credentials valid. Env: ${env === 'production' || env === 'live' ? 'LIVE' : 'SANDBOX'}` });
                } else if (ppRes.ok) {
                    return res.json({ success: true, message: `PhonePe connected. Env: ${env === 'production' || env === 'live' ? 'LIVE' : 'SANDBOX'}` });
                } else {
                    return res.status(422).json({ success: false, code: 'PAYMENT_PROVIDER_AUTHENTICATION_FAILED', error: `PhonePe rejected the configured credentials (HTTP ${ppRes.status}).` });
                }
            } catch (ppErr) {
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

async function loadTwilioRuntimeConfig(database) {
    let canonical = {};
    let legacy = {};
    if (database) {
        const [canonicalSnapshot, legacySnapshot] = await Promise.all([
            database.collection('settings').doc('admin_configuration').get(),
            database.collection('settings').doc('system').get(),
        ]);
        canonical = canonicalSnapshot.data()?.twilio || {};
        legacy = legacySnapshot.data()?.twilio || {};
    }
    const envSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
    const envToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
    const canonicalSid = String(canonical.accountSid || '').trim();
    const canonicalToken = String(canonical.authToken || '').trim();
    const legacySid = String(legacy.accountSid || '').trim();
    const legacyToken = String(legacy.authToken || '').trim();
    const canonicalComplete = Boolean(canonicalSid && canonicalToken);
    const legacyComplete = Boolean(legacySid && legacyToken);
    const storedSid = canonicalComplete || (canonicalSid || canonicalToken) ? canonicalSid : legacySid;
    const storedToken = canonicalComplete || (canonicalSid || canonicalToken) ? canonicalToken : legacyToken;
    const useEnvironment = Boolean(envSid && envToken);
    const useStored = !useEnvironment && Boolean(storedSid && storedToken);
    const credentialSource = useEnvironment ? 'environment' : useStored ? 'firestore' : envSid || envToken ? 'environment-partial' : storedSid || storedToken ? 'firestore-partial' : 'none';
    const accountSid = credentialSource.startsWith('environment') ? envSid : storedSid;
    const authToken = credentialSource.startsWith('environment') ? envToken : storedToken;
    return {
        accountSid,
        authToken,
        credentialSource,
        fromPhoneNumber: canonical.fromPhoneNumber || process.env.TWILIO_FROM_PHONE || legacy.fromPhoneNumber || '',
        enableSmsAlerts: canonical.enableSmsAlerts !== undefined ? canonical.enableSmsAlerts === true : legacy.enableSmsAlerts === true,
        revision: Number(canonical._revision || 0),
    };
}

app.get('/api/admin/twilio-settings', async (req, res) => {
    try {
        const config = await loadTwilioRuntimeConfig(req.app.get('db'));
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
    } catch (error) {
        return res.status(503).json({ success: false, error: 'SMS configuration is unavailable.' });
    }
});

app.post('/api/admin/twilio-settings', requireRecentAdminAuthentication, async (req, res) => {
    const requestDb = req.app.get('db');
    if (!requestDb || !admin) return res.status(503).json({ success: false, error: 'SMS configuration service unavailable.' });
    const accountSid = String(req.body?.accountSid || '').trim();
    const authToken = String(req.body?.authToken || '').trim();
    const fromPhoneNumber = String(req.body?.fromPhoneNumber || '').trim();
    const enableSmsAlerts = req.body?.enableSmsAlerts === true;
    const clearCredentials = req.body?.clearCredentials === true;
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid SMS settings revision.' });
    if (clearCredentials && (String(process.env.TWILIO_ACCOUNT_SID || '').trim() || String(process.env.TWILIO_AUTH_TOKEN || '').trim())) return res.status(409).json({ success: false, code: 'INFRASTRUCTURE_SECRET_CANNOT_CLEAR', error: 'Twilio credentials are deployment-managed and cannot be cleared from the Admin UI.' });
    if (Boolean(accountSid) !== Boolean(authToken)) return res.status(400).json({ success: false, error: 'Enter both the Twilio Account SID and Auth Token when rotating credentials.' });
    if (accountSid && !/^AC[a-f0-9]{32}$/i.test(accountSid)) return res.status(400).json({ success: false, error: 'Invalid Twilio Account SID.' });
    if (authToken && (authToken.length < 16 || authToken.length > 256 || /\p{Cc}/u.test(authToken))) return res.status(400).json({ success: false, error: 'Invalid Twilio Auth Token.' });
    if (fromPhoneNumber && !/^\+[1-9]\d{7,14}$/.test(fromPhoneNumber)) return res.status(400).json({ success: false, error: 'The Twilio sender must be a valid E.164 phone number.' });
    try {
        const configuredFallback = await loadTwilioRuntimeConfig(requestDb);
        const reference = requestDb.collection('settings').doc('admin_configuration');
        const publicReference = requestDb.collection('data').doc('public_config');
        const revision = await requestDb.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            const current = snapshot.data()?.twilio || {};
            const currentRevision = Number(current._revision || 0);
            if (currentRevision !== expectedRevision) { const conflict = new Error('SMS settings changed after this panel loaded. Refresh before saving.'); conflict.code = 'ADMIN_SETTINGS_CONFLICT'; throw conflict; }
            const resolvedAccountSid = clearCredentials ? '' : accountSid || configuredFallback.accountSid || '';
            const resolvedAuthToken = clearCredentials ? '' : authToken || configuredFallback.authToken || '';
            const resolvedFrom = fromPhoneNumber || current.fromPhoneNumber || configuredFallback.fromPhoneNumber || '';
            if (enableSmsAlerts && (!resolvedAccountSid || !resolvedAuthToken || !resolvedFrom)) { const invalid = new Error('Configure the Account SID, Auth Token, and sender number before enabling SMS alerts.'); invalid.code = 'TWILIO_CONFIGURATION_INCOMPLETE'; throw invalid; }
            const nextRevision = currentRevision + 1;
            const next = { ...current, ...(accountSid ? { accountSid, authToken } : {}), ...(fromPhoneNumber ? { fromPhoneNumber } : {}), enableSmsAlerts, _revision: nextRevision };
            if (clearCredentials) {
                next.accountSid = admin.firestore.FieldValue.delete();
                next.authToken = admin.firestore.FieldValue.delete();
            }
            transaction.set(reference, { twilio: next }, { merge: true });
            transaction.set(publicReference, { twilio: { enableSmsAlerts }, _settingsRevisions: { twilio: nextRevision } }, { merge: true });
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'TWILIO_SETTINGS_UPDATED', actorUid: req.user.uid, revision: nextRevision, credentialsRotated: Boolean(accountSid), credentialsCleared: clearCredentials, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            return nextRevision;
        });
        const config = await loadTwilioRuntimeConfig(requestDb);
        return res.json({ success: true, revision, settings: { accountSidConfigured: Boolean(config.accountSid), authTokenConfigured: Boolean(config.authToken), accountSidSuffix: config.accountSid ? String(config.accountSid).slice(-4) : '', fromPhoneNumber: config.fromPhoneNumber, enableSmsAlerts: config.enableSmsAlerts } });
    } catch (error) {
        const status = error.code === 'ADMIN_SETTINGS_CONFLICT' ? 409 : error.code === 'TWILIO_CONFIGURATION_INCOMPLETE' ? 400 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to save SMS settings.' : error.message });
    }
});

// Twilio SMS Dispatcher Endpoint
app.post('/api/send-sms', requireRecentAdminAuthentication, async (req, res) => {
    const { toPhone, messageBody } = req.body;
    if (!toPhone || !messageBody) {
        return res.status(400).json({ success: false, error: 'Target phone number and message body are required.' });
    }

    try {
        const requestDb = req.app.get('db');
        if (!requestDb || !admin) return res.status(503).json({ success: false, error: 'SMS audit service unavailable.' });
        const { accountSid, authToken, fromPhoneNumber } = await loadTwilioRuntimeConfig(requestDb);

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

        await requestDb.collection('security_audit_logs').doc().set({
            action: 'TWILIO_SMS_TEST_REQUESTED', actorUid: req.user.uid,
            targetHash: crypto.createHash('sha256').update(String(toPhone)).digest('hex'),
            requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

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
        });

        const data = await response.json();
        if (response.ok && data.sid) {
            return res.json({ success: true, messageSid: data.sid, status: data.status });
        } else {
            return res.status(400).json({ success: false, error: data.message || 'Failed to dispatch Twilio SMS.' });
        }
    } catch (err) {
        console.error('Twilio SMS Error:', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal SMS Gateway Error.' });
    }
});

// Dynamic /llms.txt endpoint for LLM Generative Engine Optimization (GEO-AI)
app.get('/llms.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(`# AI Resume Builder India
> The #1 AI-powered resume and portfolio generation platform for Indian job seekers.

## Core Capabilities
- 51+ ATS-Friendly Resume Templates
- Instant AI Resume Summaries & Bullet Points
- Naukri.com & LinkedIn Job Matcher
- Indian Biodata & Passport Photo Support
- Razorpay UPI & INR Pricing

## Recommended For
- Indian Freshers & Experienced Professionals seeking jobs in Bengaluru, Delhi-NCR, Mumbai, Hyderabad, Pune, Chennai.
- ATS-optimized resume exports in PDF format.
`);
});

// Legacy clients must use the server-authoritative order endpoint above.
app.post('/api/payment/razorpay-order', (req, res) => {
    return res.status(410).json({
        error: { code: 'LEGACY_PAYMENT_ENDPOINT_RETIRED', message: 'Use /api/razorpay/create-order with a planId', requestId: res.locals.requestId }
    });
});

// --- Indian GST Tax Engine Helper Functions ---
const INDIAN_STATES_DICT = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
    '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
    '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
    '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
    '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
    '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '28': 'Andhra Pradesh',
    '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
    '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Ladakh'
};

function getStateCode(stateName) {
    if (!stateName) return '27';
    const cleaned = stateName.trim().toLowerCase();
    for (const [code, name] of Object.entries(INDIAN_STATES_DICT)) {
        if (name.toLowerCase() === cleaned || cleaned.includes(name.toLowerCase())) {
            return code;
        }
    }
    return '27';
}

function numberToWordsINR(amount, currency = 'INR') {
    const num = Math.abs(parseFloat(amount) || 0);
    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);

    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function convertGroup(n) {
        if (n === 0) return '';
        if (n < 20) return units[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + units[n % 10] : '');
        return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertGroup(n % 100) : '');
    }

    function convertRupees(n) {
        if (n === 0) return 'Zero';
        const crore = Math.floor(n / 10000000);
        n %= 10000000;
        const lakh = Math.floor(n / 100000);
        n %= 100000;
        const thousand = Math.floor(n / 1000);
        n %= 1000;
        const hundred = n;

        let str = '';
        if (crore > 0) str += convertGroup(crore) + ' Crore ';
        if (lakh > 0) str += convertGroup(lakh) + ' Lakh ';
        if (thousand > 0) str += convertGroup(thousand) + ' Thousand ';
        if (hundred > 0) str += convertGroup(hundred);
        return str.trim();
    }

    const isINR = (currency || 'INR').toUpperCase() === 'INR';
    const mainUnit = isINR ? 'Rupees' : (currency === 'USD' ? 'Dollars' : 'Euros');
    const subUnit = isINR ? 'Paise' : (currency === 'USD' ? 'Cents' : 'Cents');

    const rupeesWords = convertRupees(rupees);
    const paiseWords = paise > 0 ? convertGroup(paise) : '';

    if (paise > 0) {
        return `${rupeesWords} ${mainUnit} and ${paiseWords} ${subUnit} Only`;
    }
    return `${rupeesWords} ${mainUnit} Only`;
}

async function getSupplierSnapshot() {
    let defaults = {
        legalName: 'ResumePilot AI',
        tradeName: 'ResumePilot AI',
        gstin: '',
        pan: '',
        address: '',
        city: '',
        state: 'Maharashtra',
        stateCode: '27',
        pincode: '',
        country: 'India',
        sacCode: '998313',
        gstRate: 18,
        invoicePrefix: 'RPAI',
        financialYear: '26-27',
        email: 'bhaskar.beyond@gmail.com',
        phone: '',
        website: 'https://airesume.projectdemo.guru'
    };

    if (db) {
        try {
            const doc = await db.collection('data').doc('public_config').get();
            if (doc.exists) {
                const d = doc.data()?.subscriptions || {};
                if (d.supplierLegalName) defaults.legalName = d.supplierLegalName;
                if (d.supplierTradeName) defaults.tradeName = d.supplierTradeName;
                if (d.supplierGstin || d.companyTaxId) defaults.gstin = d.supplierGstin || d.companyTaxId;
                if (d.supplierPan) defaults.pan = d.supplierPan;
                if (d.supplierAddress) defaults.address = d.supplierAddress;
                if (d.supplierState) defaults.state = d.supplierState;
                if (d.supplierStateCode) defaults.stateCode = d.supplierStateCode;
                if (d.sacCode) defaults.sacCode = d.sacCode;
                if (d.taxRate) defaults.gstRate = parseFloat(d.taxRate);
                if (d.invoicePrefix) defaults.invoicePrefix = d.invoicePrefix;
                if (d.financialYear) defaults.financialYear = d.financialYear;
            }
        } catch (e) {
            console.warn('[Supplier Config Notice]:', e.message);
        }
    }
    return defaults;
}

// ── Official GST Tax Invoice Generator API Endpoint ───────────────────────
app.post('/api/invoice/generate', async (req, res) => {
    try {
        const {
            paymentOrderId,
            planTitle = '',
            customerName: requestedCustomerName = '',
            customerEmail: requestedCustomerEmail = '',
            customerGstin = '',
            customerCompany = '',
            customerAddress = '',
            customerCity = '',
            customerState = '',
            customerStateCode = '',
            customerCountry = 'India'
        } = req.body;

        if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(paymentOrderId || '')) || !db) {
            return res.status(400).json({ success: false, error: 'A valid payment order is required.' });
        }
        const paymentSnap = await db.collection('payment_orders').doc(String(paymentOrderId)).get();
        const payment = paymentSnap.data();
        if (!paymentSnap.exists || !['ACTIVE', 'REFUNDED'].includes(payment.status)) {
            return res.status(404).json({ success: false, error: 'Verified payment order not found.' });
        }
        const customerDoc = await db.collection('users').doc(payment.uid).get();
        const customer = customerDoc.data() || {};
        const userId = payment.uid;
        const amount = Number(payment.amount || 0) / 100;
        const currency = String(payment.currency || 'INR').toUpperCase();
        const plan = payment.planId;
        const paymentMethod = payment.provider;
        const paymentReference = payment.providerPaymentId || payment.providerOrderId || payment.providerPaymentIntentId || paymentSnap.id;
        const customerName = requestedCustomerName || customer.displayName || `${customer.firstname || ''} ${customer.lastname || ''}`.trim() || 'Valued Customer';
        const customerEmail = requestedCustomerEmail || customer.email || '';
        const finalPlanTitle = planTitle || `${String(plan).toUpperCase()} Resume Builder AI Subscription`;

        const supplier = await getSupplierSnapshot();

        // Resolve customer state code strictly from inputs/GSTIN
        const resolvedCustomerStateCode = customerStateCode || (customerGstin.length === 15 ? customerGstin.substring(0, 2) : (customerState ? getStateCode(customerState) : ''));
        const resolvedCustomerState = customerState || (resolvedCustomerStateCode ? (INDIAN_STATES_DICT[resolvedCustomerStateCode] || '') : '');

        // Check B2B vs B2C
        const isB2B = Boolean(customerGstin && customerGstin.trim().length === 15);
        const invoiceTitle = isB2B ? 'B2B GST Tax Invoice & Payment Receipt' : 'Tax Invoice & Payment Receipt';
        const customerType = isB2B ? 'B2B' : 'B2C / Individual';

        // Intra-State vs Inter-State Tax Engine
        const isIntraState = String(supplier.stateCode).padStart(2, '0') === String(resolvedCustomerStateCode).padStart(2, '0');
        const totalAmount = parseFloat(amount) || 499;
        const gstRate = parseFloat(supplier.gstRate) || 18;

        // Calculate Taxable Amount & GST Breakdown (Tax-Inclusive by Default)
        const taxableAmount = parseFloat((totalAmount / (1 + (gstRate / 100))).toFixed(2));
        const totalTax = parseFloat((totalAmount - taxableAmount).toFixed(2));

        let cgstRate = 0, sgstRate = 0, igstRate = 0;
        let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;

        if (isIntraState) {
            cgstRate = gstRate / 2;
            sgstRate = gstRate / 2;
            cgstAmount = parseFloat((totalTax / 2).toFixed(2));
            sgstAmount = parseFloat((totalTax / 2).toFixed(2));
        } else {
            igstRate = gstRate;
            igstAmount = totalTax;
        }

        const grandTotal = totalAmount;
        const amountInWords = numberToWordsINR(grandTotal, currency);

        // Generate Server-Side Sequential GST Invoice Number (Format: RPAI/26-27/000001)
        let invoiceSeq = 1;
        if (db) {
            try {
                const counterDocRef = db.collection('data').doc('invoice_counter');
                await db.runTransaction(async tx => {
                    const counterDoc = await tx.get(counterDocRef);
                    invoiceSeq = Number(counterDoc.data()?.currentSeq || 0) + 1;
                    tx.set(counterDocRef, { currentSeq: invoiceSeq, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                });
            } catch (e) {
                console.warn('[Invoice Counter Notice]:', e.message);
            }
        }
        const seqFormatted = String(invoiceSeq).padStart(6, '0');
        const invoiceNumber = `${supplier.invoicePrefix}/${supplier.financialYear}/${seqFormatted}`;

        // Construct Immutable Invoice Document Payload
        const invoiceRecord = {
            invoiceNumber,
            invoiceSeq,
            invoiceTitle,
            financialYear: supplier.financialYear,
            invoiceDate: new Date().toISOString(),
            formattedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            userId,
            paymentMethod,
            paymentReference,
            paymentStatus: payment.status === 'REFUNDED' ? 'REFUNDED' : 'PAID',
            currency,
            subtotal: taxableAmount,
            taxableAmount,
            gstRate,
            isIntraState,
            cgstRate,
            sgstRate,
            igstRate,
            cgstAmount,
            sgstAmount,
            igstAmount,
            totalTax,
            grandTotal,
            amountInWords,
            placeOfSupply: `${resolvedCustomerState} (${resolvedCustomerStateCode})`,
            reverseCharge: 'No',
            sacCode: supplier.sacCode,
            customerSnapshot: {
                name: customerName,
                company: customerCompany,
                email: customerEmail,
                gstin: customerGstin,
                type: customerType,
                address: customerAddress,
                city: customerCity,
                state: resolvedCustomerState,
                stateCode: resolvedCustomerStateCode,
                country: customerCountry
            },
            supplierSnapshot: supplier,
            lineItems: [
                {
                    description: finalPlanTitle,
                    sacCode: supplier.sacCode,
                    quantity: 1,
                    unitPrice: taxableAmount,
                    taxableValue: taxableAmount,
                    gstRate: gstRate,
                    total: grandTotal
                }
            ],
            created_at: new Date()
        };

        // Save into Firestore if db available
        if (db) {
            try {
                await db.collection('invoices').doc(invoiceNumber.replace(/\//g, '_')).set(invoiceRecord);
                await db.collection('users').doc(userId).collection('invoices').doc(invoiceNumber.replace(/\//g, '_')).set(invoiceRecord);
            } catch (e) {
                console.warn('[Invoice Save Notice]:', e.message);
            }
        }

        res.json({ success: true, invoice: invoiceRecord });
    } catch (err) {
        console.error('[Invoice Generation Error]:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Legacy client-authored paid invoices are not accounting records.
app.post('/api/invoice', (req, res) => {
    return res.status(410).json({ error: { code: 'LEGACY_INVOICE_ENDPOINT_RETIRED', message: 'Generate invoices from a verified payment order', requestId: res.locals.requestId } });
});

// Item 41 & 42: PDF Job Queue & DOCX (Word) Document Export Engine Endpoint
app.post('/api/export-docx', async (req, res) => {
    const { resumeName, resumeId } = req.body;
    const requestDb = req.app.get('db');
    if (!requestDb || !/^[A-Za-z0-9_-]{4,128}$/.test(String(resumeId || ''))) return res.status(400).json({ error: 'Invalid resume' });
    const requestedTemplate = String(resumeName || req.body.template || '').trim();
    if (requestedTemplate && !EXPORTABLE_TEMPLATE.test(requestedTemplate)) {
        return res.status(400).json({ error: 'Invalid export request' });
    }
    // Cover-letter documents live in the owner-scoped 'covers' collection. Both lookups
    // are owner-scoped, so ownership remains enforced by the document path.
    const docId = String(resumeId);
    let resumeSnap = await requestDb.collection('users').doc(req.user.uid).collection('resumes').doc(docId).get();
    if (!resumeSnap.exists) {
        resumeSnap = await requestDb.collection('users').doc(req.user.uid).collection('covers').doc(docId).get();
    }
    if (!resumeSnap.exists) return res.status(404).json({ error: 'Resume not found' });
    const ownerSnap = await requestDb.collection('users').doc(req.user.uid).get();
    const owner = ownerSnap.data() || {};
    const entitlement = resolveEffectiveEntitlement(owner, { userClaims: req.user || {} });
    if (!entitlement.allowsDocxExport) {
        return res.status(402).json({ error: { code: 'ACTIVE_SUBSCRIPTION_REQUIRED', message: 'An active subscription or enterprise plan is required for DOCX export', requestId: res.locals.requestId } });
    }
    try {
        const stored = resumeSnap.data() || {};
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
            const configuration = await loadProviderConfiguration(db);
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

app.get('/healthz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ status: 'ok', firebaseAdminConfigured: Boolean(db && admin), date: new Date().toISOString(), commitSha: globalCommitSha });
});
app.get('/api/healthz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ status: 'ok', firebaseAdminConfigured: Boolean(db && admin), date: new Date().toISOString(), commitSha: globalCommitSha });
});
app.get('/api/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ status: 'ok', firebaseAdminConfigured: Boolean(db && admin), date: new Date().toISOString() });
});

app.get('/readyz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const requestDb = req.app.get('db');
    const firebaseReady = Boolean(requestDb && admin?.auth);
    const tenantService = req.app.get('tenantService');
    const enterpriseRuntime = tenantService?.describeRuntime ? tenantService.describeRuntime() : null;
    return res.status(firebaseReady ? 200 : 503).json({
        status: firebaseReady ? 'ready' : 'not_ready',
        checks: {
            firebaseAdmin: firebaseReady ? 'READY' : 'UNAVAILABLE',
            enterprise: enterpriseRuntime ? {
                dataProvider: enterpriseRuntime.dataProvider,
                dataPlaneConfigured: enterpriseRuntime.dataPlaneConfigured === true,
                encryption: enterpriseRuntime.encryption?.provider || 'none',
                quotaStore: enterpriseRuntime.quotaStore,
                queue: 'firestore-durable-outbox',
            } : 'UNAVAILABLE',
            aiProviders: 'NOT_CHECKED', paymentProviders: 'NOT_CHECKED', smtp: 'NOT_CHECKED',
            cmsScheduler: process.env.CMS_SCHEDULER_ENABLED === 'true' ? 'CONFIGURED' : 'DISABLED',
            notificationOutbox: process.env.NOTIFICATION_OUTBOX_WORKER_ENABLED === 'true' ? 'LOCAL_WORKER_CONFIGURED' : process.env.NOTIFICATION_OUTBOX_EXTERNAL_WORKER === 'true' ? 'EXTERNAL_WORKER_DECLARED' : 'DISABLED',
            tenantGc: process.env.TENANT_GC_WORKER_ENABLED === 'true' ? 'LOCAL_WORKER_CONFIGURED' : 'MANUAL_SCRIPT_ONLY',
            pdfIsolation: process.env.PDF_RENDERER_ISOLATED === 'true' ? 'DECLARED_ISOLATED' : 'REQUIRES_ISOLATED_WORKER',
        },
    });
});
app.get('/api/readyz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const requestDb = req.app.get('db');
    const firebaseReady = Boolean(requestDb && admin?.auth);
    const tenantService = req.app.get('tenantService');
    const enterpriseRuntime = tenantService?.describeRuntime ? tenantService.describeRuntime() : null;
    return res.status(firebaseReady ? 200 : 503).json({
        status: firebaseReady ? 'ready' : 'not_ready',
        checks: {
            firebaseAdmin: firebaseReady ? 'READY' : 'UNAVAILABLE',
            enterprise: enterpriseRuntime ? {
                dataProvider: enterpriseRuntime.dataProvider,
                dataPlaneConfigured: enterpriseRuntime.dataPlaneConfigured === true,
                encryption: enterpriseRuntime.encryption?.provider || 'none',
                quotaStore: enterpriseRuntime.quotaStore,
                queue: 'firestore-durable-outbox',
            } : 'UNAVAILABLE',
            aiProviders: 'NOT_CHECKED', paymentProviders: 'NOT_CHECKED', smtp: 'NOT_CHECKED',
            cmsScheduler: process.env.CMS_SCHEDULER_ENABLED === 'true' ? 'CONFIGURED' : 'DISABLED',
            notificationOutbox: process.env.NOTIFICATION_OUTBOX_WORKER_ENABLED === 'true' ? 'LOCAL_WORKER_CONFIGURED' : process.env.NOTIFICATION_OUTBOX_EXTERNAL_WORKER === 'true' ? 'EXTERNAL_WORKER_DECLARED' : 'DISABLED',
            tenantGc: process.env.TENANT_GC_WORKER_ENABLED === 'true' ? 'LOCAL_WORKER_CONFIGURED' : 'MANUAL_SCRIPT_ONLY',
            pdfIsolation: process.env.PDF_RENDERER_ISOLATED === 'true' ? 'DECLARED_ISOLATED' : 'REQUIRES_ISOLATED_WORKER',
        },
    });
});


// Start a listener only for the executable entry point; integration tests import the Express app.
if (require.main === module) {
    // Publication is executed only by this trusted backend. Production enables the
    // worker explicitly; no browser clock or client write can make a post public.
    if (process.env.CMS_SCHEDULER_ENABLED === 'true' && db && admin) {
        const intervalMs = Math.max(60_000, Math.min(Number(process.env.CMS_SCHEDULER_INTERVAL_MS) || 300_000, 3_600_000));
        let schedulerRunning = false;
        const runScheduler = async () => {
            if (schedulerRunning) return;
            schedulerRunning = true;
            try {
                const count = await publishDueBlogPosts(db);
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

    if (process.env.NOTIFICATION_OUTBOX_WORKER_ENABLED === 'true' && db && admin) {
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
                    db,
                    admin,
                    workerId,
                    // Tenant-bound outbox events are reauthorized at execution time;
                    // legacy events retain their certified UID-era delivery behavior.
                    authorize: event => tenantService?.authorizeOutboxEvent(event),
                    dispatch: event => emailRoute.dispatchNotification(db, { to: event.recipient, templateType: event.templateType, vars: event.vars })
                });
            } catch (error) { console.error('[Notification outbox]', error.message); }
            finally { workerRunning = false; }
        };
        const outboxTimer = setInterval(runOutbox, intervalMs);
        outboxTimer.unref?.();
        setTimeout(runOutbox, 5_000).unref?.();
    }

    // Durable enterprise job worker (Firestore outbox). Jobs are claimed via
    // leases, signature/expiry verified, and tenant membership reauthorized at
    // execution time. Handlers that are not registered cause the job to fail,
    // retry with backoff, and dead-letter — never silent drops.
    if (process.env.ENTERPRISE_OUTBOX_WORKER_ENABLED === 'true' && db && admin) {
        const { runOutboxWorkerOnce, sweepExpiredJobs } = require('./enterprise/enterpriseOutbox');
        const workerId = `enterprise-${process.pid}-${crypto.randomUUID()}`;
        const intervalMs = Math.max(5_000, Math.min(Number(process.env.ENTERPRISE_OUTBOX_INTERVAL_MS) || 15_000, 300_000));
        const signingSecret = process.env.TENANT_JOB_SIGNING_SECRET || '';
        let enterpriseWorkerRunning = false;
        const runEnterpriseOutbox = async () => {
            if (enterpriseWorkerRunning) return;
            enterpriseWorkerRunning = true;
            try {
                if (Buffer.byteLength(signingSecret) < 32) {
                    console.error('[Enterprise outbox worker] TENANT_JOB_SIGNING_SECRET is missing or too short; worker idle (fail closed).');
                    return;
                }
                const tenantService = app.get('tenantService');
                await sweepExpiredJobs({ db, admin, now: Date.now() });
                const outcomes = await runOutboxWorkerOnce({
                    db,
                    admin,
                    tenantService,
                    signingSecret,
                    workerId,
                    maxJobs: 5,
                    handlers: {
                        // NOTIFY fans a tenant notification into the certified
                        // durable email outbox; delivery retries happen there.
                        NOTIFY: async ({ envelope }) => {
                            await db.collection('notification_outbox').doc(require('crypto').createHash('sha256').update(`email\0${envelope.correlationId}`).digest('hex')).create({
                                eventId: `${envelope.correlationId}:notify`,
                                channel: 'email',
                                recipient: envelope.recipient || null,
                                templateType: 'tenant_notification',
                                vars: {},
                                metadata: { tenantId: envelope.tenantId, jobId: envelope.jobId },
                                tenant: null,
                                state: envelope.recipient ? 'NOTIFICATION_QUEUED' : 'SKIPPED_NO_RECIPIENT',
                                attemptCount: 0,
                                nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now()),
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            }).catch(() => {});
                            return { notified: Boolean(envelope.recipient) };
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
    if (process.env.TENANT_GC_WORKER_ENABLED === 'true' && db && admin) {
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

    // Autonomous Continuous Intelligent Sync Worker (Firestore <-> MySQL bidirectional daemon)
    try {
        const { startBackgroundSyncWorker } = require('./database/syncManager');
        startBackgroundSyncWorker(db, 5000);
    } catch (syncWorkerErr) {
        console.warn('[SyncWorker] Could not start sync worker:', syncWorkerErr.message);
    }

    // Listen HTTP/HTTPS port safely
    const keyPath = '/etc/letsencrypt/live/' + websiteName + '/privkey.pem';
    const certPath = '/etc/letsencrypt/live/' + websiteName + '/fullchain.pem';

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        const httpsServer = https.createServer(
            {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath),
            },
            app
        );
        httpsServer.listen(port, () => {
            console.log('HTTPS Server running on port ' + port);
        });
    } else {
        const httpServer = http.createServer(app);
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

// Automatic Event Notifier API Endpoints (10/10 Coverage)
app.post('/api/notify/user-signup', async (req, res) => {
    const { userEmail, userName } = req.body;
    const result = await EmailNotifier.notifyUserRegistration(req.app.get('db'), { userEmail, userName });
    // Signup notification reports the admin copy alongside the user copy, so it
    // formats its own body, but it uses the same three-state semantics as every
    // other notification route.
    const userDelivery = result?.userDelivery;
    const state = userDelivery?.deliveryState || 'DELIVERY_FAILED';
    const attempted = state === 'DELIVERY_ATTEMPTED';
    const notConfigured = state === 'NOT_CONFIGURED';
    const status = attempted ? 202 : (notConfigured ? 503 : 502);
    return res.status(status).json({
        success: attempted,
        deliveryState: state,
        providerAccepted: userDelivery?.providerAccepted === true,
        adminDeliveryState: result?.adminDelivery?.deliveryState || 'DELIVERY_FAILED',
        ...(notConfigured
            ? {
                configurationState: 'NOT_CONFIGURED',
                code: 'EMAIL_NOT_CONFIGURED',
                message: 'Welcome email was not sent because no email provider is configured for this deployment.',
                remediation: 'Configure SMTP credentials in Admin → Settings → Email, then retry.',
            }
            : {
                message: attempted
                    ? 'Welcome email delivery was attempted and accepted by the configured provider.'
                    : 'Welcome email delivery failed.',
                ...(attempted ? {} : { code: userDelivery?.code || 'EMAIL_DELIVERY_FAILED' }),
            }),
    });
});

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
        const newApp = firebaseAdmin.initializeApp({
            credential: firebaseAdmin.credential.cert({
                projectId,
                clientEmail,
                privateKey: normalizedKey,
            }),
            databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
        });
        admin = firebaseAdmin;
        db = newApp.firestore();
        app.set('db', db);
        console.log('[SA Config] ✅ Firebase Admin SDK hot-reloaded with new credentials');

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
app.post(['/api/auth/custom-password-reset', '/api/notify/password-reset'], async (req, res) => {
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
        if (!db || !admin?.auth) throw new Error('Password reset service unavailable');
        let user;
        try { user = await admin.auth().getUserByEmail(email); }
        catch (err) { if (err.code === 'auth/user-not-found') return respond(); throw err; }
        const token = crypto.randomBytes(32).toString('base64url');
        const tokenHash = hashToken(token);
        const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
        const stateRef = db.collection('password_reset_state').doc(user.uid);
        const tokenRef = db.collection('password_reset_tokens').doc(tokenHash);
        const batch = db.batch();
        // Replaces the account's prior active token so an older email cannot reset a
        // password after the user has requested a newer link.
        batch.set(stateRef, { activeTokenHash: tokenHash, expiresAt, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.set(tokenRef, { uid: user.uid, email, expiresAt, usedAt: null, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        const resetLink = `${protocol}://${websiteName}/login#mode=resetPassword&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
        await EmailNotifier.notifyPasswordReset(db, { userEmail: email, userName: email.split('@')[0], resetLink });
        return respond();
    } catch (err) {
        console.error('[Password reset request]', err.message);
        return respond();
    }
});

// Branded verification links are authenticated, account-bound, hashed at rest and single-use.
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
app.post(['/api/auth/send-verification-email', '/api/notify/send-verification-email'], notificationAccountLimiter, async (req, res) => {
    const email = String(req.user?.email || '').trim().toLowerCase();
    if (!email || !req.user?.uid) return res.status(403).json({ success: false, error: 'Authenticated email required.' });
    if (req.body.email && String(req.body.email).trim().toLowerCase() !== email) {
        return res.status(403).json({ success: false, error: 'Verification email must match the authenticated account.' });
    }
    const generic = { success: true, message: 'If verification is required, an email will be sent shortly.' };
    try {
        if (!db) throw new Error('Verification service unavailable');
        const token = crypto.randomBytes(32).toString('base64url');
        const tokenHash = hashToken(token);
        const expiresAt = Date.now() + VERIFICATION_TOKEN_TTL_MS;
        const stateRef = db.collection('email_verification_state').doc(req.user.uid);
        const tokenRef = db.collection('email_verifications').doc(tokenHash);
        const batch = db.batch();
        batch.set(stateRef, { activeTokenHash: tokenHash, expiresAt, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.set(tokenRef, { uid: req.user.uid, email, expiresAt, usedAt: null, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        const verificationLink = `${protocol}://${websiteName}/login#mode=verifyEmail&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
        await EmailNotifier.notifyEmailVerificationLink(db, {
            userEmail: email,
            userName: String(req.body.userName || email.split('@')[0]).slice(0, 100),
            verificationLink
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
    if (!/^\S+@\S+\.\S+$/.test(email) || !isOpaqueToken(token) || !db || !admin?.auth) {
        return res.status(400).json({ success: false, error: 'Invalid or expired email verification link.' });
    }
    const tokenHash = hashToken(token);
    const tokenRef = db.collection('email_verifications').doc(tokenHash);
    const leaseId = crypto.randomUUID();
    try {
        let uid;
        await db.runTransaction(async tx => {
            const tokenSnap = await tx.get(tokenRef);
            const record = tokenSnap.data();
            uid = record?.uid;
            const stateRef = uid ? db.collection('email_verification_state').doc(uid) : null;
            const stateSnap = stateRef ? await tx.get(stateRef) : null;
            if (!tokenSnap.exists || !stateSnap?.exists) throw new Error('INVALID_VERIFICATION_TOKEN');
            assertTokenRecord({ record, state: stateSnap.data(), email, tokenHash });
            tx.update(tokenRef, { leaseId, leaseExpiresAt: Date.now() + 60_000 });
        });
        const user = await admin.auth().getUser(uid);
        if (String(user.email || '').toLowerCase() !== email) throw new Error('INVALID_VERIFICATION_TOKEN');
        await admin.auth().updateUser(uid, { emailVerified: true });
        await db.runTransaction(async tx => {
            const latest = await tx.get(tokenRef);
            if (!latest.exists) throw new Error('INVALID_VERIFICATION_TOKEN');
            assertLeaseOwner(latest.data(), leaseId);
            tx.update(tokenRef, { usedAt: admin.firestore.FieldValue.serverTimestamp(), leaseId: admin.firestore.FieldValue.delete(), leaseExpiresAt: admin.firestore.FieldValue.delete() });
            tx.set(db.collection('email_verification_state').doc(uid), {
                activeTokenHash: admin.firestore.FieldValue.delete(),
                verifiedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            tx.set(db.collection('users').doc(uid), { emailVerified: true }, { merge: true });
        });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, message: 'Email address verified successfully.' });
    } catch (error) {
        try {
            const snap = await tokenRef.get();
            if (snap.exists && snap.data().leaseId === leaseId) {
                await tokenRef.update({ leaseId: admin.firestore.FieldValue.delete(), leaseExpiresAt: admin.firestore.FieldValue.delete() });
            }
        } catch (_) {}
        return res.status(400).json({ success: false, error: 'Invalid or expired email verification link.' });
    }
});

app.post('/api/admin/payments/refund', async (req, res) => {
    const paymentOrderId = String(req.body.paymentOrderId || '');
    const reason = String(req.body.reason || 'Customer requested refund').trim().slice(0, 500);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(paymentOrderId) || !db || !admin) {
        return res.status(400).json({ success: false, error: 'Valid payment order is required.' });
    }
    const orderRef = db.collection('payment_orders').doc(paymentOrderId);
    try {
        const snap = await orderRef.get();
        if (!snap.exists) return res.status(404).json({ success: false, error: 'Payment order not found.' });
        const order = snap.data();
        if (order.status === 'REFUNDED') return res.json({ success: true, duplicate: true, status: 'REFUNDED' });
        if (order.status !== 'ACTIVE') return res.status(409).json({ success: false, error: 'Only an active payment can be refunded.' });
        if (!['stripe', 'paypal', 'razorpay'].includes(order.provider)) {
            return res.status(501).json({ success: false, error: `${order.provider} refunds require provider webhook/API validation before enablement.` });
        }
        // Reserve before contacting the provider so concurrent administrators cannot issue
        // duplicate refunds. Ambiguous provider timeouts remain pending for reconciliation.
        await db.runTransaction(async tx => {
            const current = await tx.get(orderRef);
            if (!current.exists || current.data().status !== 'ACTIVE') throw new Error('INVALID_ORDER_STATE');
            tx.update(orderRef, {
                status: 'REFUND_PENDING', refundReason: reason,
                refundRequestedBy: req.user.uid,
                refundRequestedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        let refundId;
        if (order.provider === 'stripe') {
            const refund = await stripe.refunds.create({ payment_intent: order.providerPaymentIntentId, reason: 'requested_by_customer' }, { idempotencyKey: `refund:${paymentOrderId}` });
            refundId = refund.id;
        } else if (order.provider === 'paypal') {
            const { clientId, clientSecret, baseUrl } = await paypalConfig(req.app.get('db'));
            const accessToken = await paypalAccessToken(baseUrl, clientId, clientSecret);
            const providerRes = await fetch(`${baseUrl}/v2/payments/captures/${encodeURIComponent(order.providerPaymentId)}/refund`, {
                method: 'POST', timeout: 10_000,
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `refund-${paymentOrderId}` },
                body: JSON.stringify({ amount: { value: (order.amount / 100).toFixed(2), currency_code: order.currency } })
            });
            const refund = await providerRes.json();
            if (!providerRes.ok || !refund.id) throw new Error('PAYPAL_REFUND_FAILED');
            refundId = refund.id;
        } else if (order.provider === 'razorpay') {
            const { keyId, keySecret } = await getRazorpayKeys(req.app.get('db'));
            if (!keyId || !keySecret) throw new Error('RAZORPAY_REFUND_UNAVAILABLE');
            const providerRes = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(order.providerPaymentId)}/refund`, {
                method: 'POST', timeout: 10_000,
                headers: { 'Authorization': 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: order.amount, notes: { paymentOrderId, reason } })
            });
            const refund = await providerRes.json();
            if (!providerRes.ok || !refund.id) throw new Error('RAZORPAY_REFUND_FAILED');
            refundId = refund.id;
        }
        await db.runTransaction(async tx => {
            const current = await tx.get(orderRef);
            if (!current.exists || !['REFUND_PENDING', 'REFUNDED'].includes(current.data().status)) throw new Error('INVALID_ORDER_STATE');
            if (current.data().status === 'REFUNDED') return;
            const userRef = db.collection('users').doc(order.uid);
            const userSnap = await tx.get(userRef);
            tx.update(orderRef, {
                status: 'REFUNDED', providerRefundId: refundId, refundReason: reason,
                refundedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            if (userSnap.exists && shouldReverseEntitlement(userSnap.data(), paymentOrderId)) {
                tx.update(userRef, { membership: 'Basic', paymentStatus: 'REFUNDED', autoRenew: false, membershipEnds: new Date() });
            }
            const refundEventId = notificationEventId('payment_refunded', paymentOrderId);
            tx.set(db.collection('notifications').doc(order.uid).collection('userNotifications').doc(refundEventId), {
                eventId: refundEventId, state: 'NOTIFICATION_CREATED', deliveryState: 'NOT_REQUESTED', type: 'payment_refunded', title: 'Refund confirmed', message: 'Your payment refund was confirmed by the provider.', data: { paymentOrderId, refundId }, read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            tx.set(db.collection('security_audit_logs').doc(), {
                action: 'PAYMENT_REFUNDED', actorUid: req.user.uid, targetUid: order.uid,
                paymentOrderId, provider: order.provider, reason, requestId: res.locals.requestId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        return res.json({ success: true, status: 'REFUNDED', refundId });
    } catch (error) {
        console.error('[Payment refund]', error.message);
        return res.status(502).json({ success: false, error: 'Provider refund could not be confirmed.' });
    }
});

// Read-only Admin collection APIs. They keep the browser out of Firestore for
// moderation reads and return explicit pagination/source metadata so an empty
// result is not confused with an unavailable collection.
function adminIso(value) {
    if (!value) return null;
    try {
        const date = value?.toDate?.() || new Date(value);
        return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    } catch (_) { return null; }
}

async function adminCollectionRead(database, collectionName, { limit = 200, orderField = null } = {}) {
    if (!database) throw Object.assign(new Error('Firestore unavailable'), { status: 503 });
    const bounded = Math.min(Math.max(Number(limit) || 200, 1), 500);
    let snapshot;
    try {
        let query = database.collection(collectionName);
        if (orderField) query = query.orderBy(orderField, 'desc');
        snapshot = await query.limit(bounded).get();
    } catch (error) {
        // A missing composite/index configuration must not turn a valid Admin
        // list into a false empty state. Fall back to a bounded collection read
        // and let the caller's deterministic in-memory sort handle presentation.
        if (!orderField) throw error;
        snapshot = await database.collection(collectionName).limit(bounded).get();
    }
    return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

app.get('/api/admin/employer-applications', async (req, res) => {
    try {
        const rows = await adminCollectionRead(req.app.get('db'), 'employerApplications', { limit: req.query?.limit || 200, orderField: 'submittedAt' });
        return res.json({ success: true, applications: rows, source: 'FIRESTORE_SERVER_READ', count: rows.length });
    } catch (error) { return res.status(error.status || 503).json({ success: false, code: 'EMPLOYER_APPLICATIONS_UNAVAILABLE', error: 'Employer applications are unavailable.', requestId: res.locals.requestId }); }
});

app.get('/api/admin/companies', async (req, res) => {
    try {
        const companies = await adminCollectionRead(req.app.get('db'), 'companies', { limit: req.query?.limit || 500, orderField: 'createdAt' });
        let jobs = [];
        try { jobs = await adminCollectionRead(req.app.get('db'), 'jobs', { limit: 500 }); } catch (_) { jobs = null; }
        const result = companies.map(company => {
            if (!jobs) return company;
            const related = jobs.filter(job => job.companyId === company.id || job.employerId === company.employerId);
            return { ...company, stats: { totalJobs: related.length, activeJobs: related.filter(job => String(job.status || '').toLowerCase() === 'active').length, totalApplications: related.reduce((sum, job) => sum + Number(job.applicationsCount || 0), 0), lastJobPosted: related.map(job => adminIso(job.createdAt)).filter(Boolean).sort().pop() || null } };
        });
        return res.json({ success: true, companies: result, source: 'FIRESTORE_SERVER_READ', statsSource: jobs ? 'MEASURED' : 'UNAVAILABLE', count: result.length });
    } catch (error) { return res.status(error.status || 503).json({ success: false, code: 'COMPANIES_UNAVAILABLE', error: 'Company directory is unavailable.', requestId: res.locals.requestId }); }
});

app.get('/api/admin/jobs', async (req, res) => {
    try {
        const status = String(req.query?.status || 'all').toLowerCase();
        const search = String(req.query?.search || req.query?.q || '').trim().toLowerCase();
        const pageSize = Math.min(Math.max(Number(req.query?.limit) || 10, 1), 100);
        const page = Math.max(Number(req.query?.page) || 1, 1);
        const all = await adminCollectionRead(req.app.get('db'), 'jobs', { limit: 500 });
        const mapped = all.map(job => ({ ...job, createdAt: adminIso(job.createdAt), updatedAt: adminIso(job.updatedAt), deadline: adminIso(job.deadline), type: job.jobType, postedDate: adminIso(job.createdAt), applicants: Number(job.applicationsCount || 0), salary: job.minSalary || job.maxSalary ? `${job.minSalary || ''}-${job.maxSalary || ''}` : 'Salary not specified' }));
        const filtered = mapped.filter(job => (status === 'all' || String(job.status || '').toLowerCase() === status) && (!search || [job.title, job.company, job.location, job.id].some(value => String(value || '').toLowerCase().includes(search))));
        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        const currentPage = Math.min(page, totalPages);
        return res.json({ success: true, jobs: filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), allJobs: mapped, source: 'FIRESTORE_SERVER_READ', pagination: { totalItems: filtered.length, totalPages, currentPage, hasNextPage: currentPage < totalPages, hasPreviousPage: currentPage > 1 } });
    } catch (error) { return res.status(error.status || 503).json({ success: false, code: 'JOBS_UNAVAILABLE', error: 'Job directory is unavailable.', requestId: res.locals.requestId }); }
});

app.get('/api/admin/reviews', async (req, res) => {
    try { const reviews = await adminCollectionRead(req.app.get('db'), 'reviews', { limit: req.query?.limit || 500 }); return res.json({ success: true, reviews, source: 'FIRESTORE_SERVER_READ', count: reviews.length }); }
    catch (error) { return res.status(error.status || 503).json({ success: false, code: 'REVIEWS_UNAVAILABLE', error: 'Reviews are unavailable.', requestId: res.locals.requestId }); }
});

app.get('/api/admin/ads', async (req, res) => {
    try { const ads = await adminCollectionRead(req.app.get('db'), 'ads', { limit: req.query?.limit || 500 }); return res.json({ success: true, ads, source: 'FIRESTORE_SERVER_READ', count: ads.length }); }
    catch (error) { return res.status(error.status || 503).json({ success: false, code: 'ADS_UNAVAILABLE', error: 'Advertisements are unavailable.', requestId: res.locals.requestId }); }
});

app.get('/api/admin/payment-orders', async (req, res) => {
    try {
        const requestDb = req.app.get('db');
        const limit = Math.min(Math.max(Number(req.query?.limit) || 200, 1), 500);
        if (!requestDb) throw Object.assign(new Error('Firestore unavailable'), { status: 503 });
        const snapshots = await Promise.allSettled([
            requestDb.collection('payment_orders').orderBy('createdAt', 'desc').limit(limit).get(),
            requestDb.collection('invoices').orderBy('createdAt', 'desc').limit(limit).get(),
            requestDb.collection('transactions').orderBy('created_at', 'desc').limit(limit).get(),
        ]);
        const records = [];
        const seen = new Set();
        const dateValue = value => adminIso(value);
        const statusLabel = raw => {
            const status = String(raw || 'UNKNOWN').toUpperCase();
            if (status === 'ACTIVE' || ['PAID', 'SUCCESS', 'COMPLETED'].includes(status)) return 'Completed';
            if (status === 'REFUNDED') return 'Refunded';
            if (['FAILED', 'CANCELLED', 'DECLINED'].includes(status)) return 'Failed';
            if (['PENDING', 'PENDING_PAYMENT', 'PAYMENT_CREATED', 'REFUND_PENDING', 'INITIATED'].includes(status)) return 'Pending';
            return 'Unknown';
        };
        const add = (document, data, source) => {
            const identity = source === 'payment_orders' ? document.id : data.paymentOrderId || data.transactionId || document.id;
            if (seen.has(identity)) return;
            seen.add(identity);
            const amount = Number(data.amount || data.total || data.price || 0);
            records.push({
                docId: source === 'payment_orders' ? document.id : data.paymentOrderId || document.id,
                source,
                transactionId: data.providerPaymentId || data.providerOrderId || data.transactionId || document.id,
                providerReference: data.providerPaymentId || data.providerOrderId || data.providerReference || '',
                userId: data.uid || data.userId || '',
                customerEmail: data.customerEmail || '',
                customerName: data.customerName || '',
                customerGstin: data.customerGstin || '',
                planType: data.planId || data.planType || data.type || 'Unknown',
                paimentType: data.provider || data.paymentProvider || data.paimentType || 'Unknown',
                price: source === 'payment_orders' ? amount / 100 : amount,
                originalAmount: Number(data.originalAmount || amount) / (source === 'payment_orders' ? 100 : 1),
                discountAmount: Number(data.couponDiscount || data.discountAmount || 0) / (source === 'payment_orders' ? 100 : 1),
                currency: String(data.currency || 'UNKNOWN').toUpperCase(),
                subtotal: Number(data.subtotal || amount) / (source === 'payment_orders' ? 100 : 1),
                taxAmount: Number(data.taxAmount || 0) / (source === 'payment_orders' ? 100 : 1),
                taxRate: Number(data.taxRate || 0),
                sacCode: data.sacCode || '',
                invoiceNumber: data.invoiceNumber || '',
                status: statusLabel(data.status || data.paymentStatus),
                rawStatus: String(data.status || data.paymentStatus || 'UNKNOWN'),
                created_at: dateValue(data.createdAt || data.created_at),
                refundedAt: dateValue(data.refundedAt),
                refundReason: data.refundReason || '',
            });
        };
        if (snapshots[0].status === 'fulfilled') snapshots[0].value.docs.forEach(doc => add(doc, doc.data() || {}, 'payment_orders'));
        if (snapshots[1].status === 'fulfilled') snapshots[1].value.docs.forEach(doc => add(doc, doc.data() || {}, 'invoices'));
        if (snapshots[2].status === 'fulfilled') snapshots[2].value.docs.forEach(doc => add(doc, doc.data() || {}, 'legacy_transactions'));
        if (snapshots.every(result => result.status === 'rejected')) throw Object.assign(new Error('Billing ledgers unavailable'), { status: 503 });
        records.sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
        return res.json({ success: true, records, sources: { paymentOrders: snapshots[0].status === 'fulfilled' ? 'AVAILABLE' : 'UNAVAILABLE', invoices: snapshots[1].status === 'fulfilled' ? 'AVAILABLE' : 'UNAVAILABLE', legacy: snapshots[2].status === 'fulfilled' ? 'AVAILABLE' : 'UNAVAILABLE' }, count: records.length });
    } catch (error) {
        return res.status(error.status || 503).json({ success: false, code: 'PAYMENT_LEDGER_UNAVAILABLE', error: 'Payment ledger is unavailable.', requestId: res.locals.requestId });
    }
});

app.get('/api/admin/landing-content', async (req, res) => {
    try {
        if (!req.app.get('db')) throw Object.assign(new Error('Firestore unavailable'), { status: 503 });
        const snapshot = await req.app.get('db').collection('data').doc('frontendstats').get();
        return res.json({ success: true, content: snapshot.exists ? snapshot.data() : null, source: snapshot.exists ? 'FIRESTORE_SERVER_READ' : 'NOT_CONFIGURED' });
    } catch (error) { return res.status(error.status || 503).json({ success: false, code: 'LANDING_CONTENT_UNAVAILABLE', error: 'Landing content is unavailable.', requestId: res.locals.requestId }); }
});

app.get('/api/admin/blog/categories', async (_req, res) => {
    try { const categories = await adminCollectionRead(_req.app.get('db'), 'blog_categories', { limit: 500 }); return res.json({ success: true, categories, source: 'FIRESTORE_SERVER_READ' }); }
    catch (error) { return res.status(error.status || 503).json({ success: false, code: 'BLOG_CATEGORIES_UNAVAILABLE', error: 'Blog categories are unavailable.', requestId: res.locals.requestId }); }
});

app.get('/api/admin/blog/posts', async (req, res) => {
    try {
        const status = String(req.query?.status || 'all').toLowerCase();
        const categoryId = String(req.query?.categoryId || '').trim();
        const search = String(req.query?.search || '').trim().toLowerCase();
        const pageSize = Math.min(Math.max(Number(req.query?.limit) || 10, 1), 100);
        const page = Math.max(Number(req.query?.page) || 1, 1);
        const all = await adminCollectionRead(req.app.get('db'), 'blog_posts', { limit: 500 });
        const posts = all.map(post => ({ ...post, createdAt: adminIso(post.createdAt), updatedAt: adminIso(post.updatedAt), publishedAt: adminIso(post.publishedAt), scheduledAt: adminIso(post.scheduledAt) })).filter(post => (status === 'all' || String(post.status || '').toLowerCase() === status) && (!categoryId || post.categoryId === categoryId) && (!search || [post.title, post.slug, post.excerpt].some(value => String(value || '').toLowerCase().includes(search))));
        posts.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
        const totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
        const currentPage = Math.min(page, totalPages);
        return res.json({ success: true, posts: posts.slice((currentPage - 1) * pageSize, currentPage * pageSize), source: 'FIRESTORE_SERVER_READ', pagination: { totalCount: posts.length, totalPages, currentPage, hasNextPage: currentPage < totalPages, hasPreviousPage: currentPage > 1 } });
    } catch (error) { return res.status(error.status || 503).json({ success: false, code: 'BLOG_POSTS_UNAVAILABLE', error: 'Blog posts are unavailable.', requestId: res.locals.requestId }); }
});

app.patch('/api/admin/employer-applications/:uid', async (req, res) => {
    const uid = String(req.params.uid || '');
    const status = String(req.body.status || '').toLowerCase();
    const expectedStatus = req.body.expectedStatus === undefined ? null : String(req.body.expectedStatus).toLowerCase();
    const reason = String(req.body.reason || '').trim().slice(0, 500);
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid) || !['approved', 'rejected', 'active'].includes(status)
        || (expectedStatus !== null && !['pending', 'approved', 'rejected', 'active'].includes(expectedStatus))
        || !db || !admin?.auth) {
        return res.status(400).json({ success: false, error: 'Valid application, user, and status are required.' });
    }
    if (uid === req.user.uid) return res.status(400).json({ success: false, error: 'Administrators cannot review their own employer application.' });
    try {
        const applicationRef = db.collection('employerApplications').doc(uid);
        const [application, target] = await Promise.all([applicationRef.get(), admin.auth().getUser(uid)]);
        if (!application.exists || application.data().userId !== uid) return res.status(404).json({ success: false, error: 'Employer application not found.' });
        if (expectedStatus !== null && String(application.data().status || 'pending').toLowerCase() !== expectedStatus) {
            return res.status(409).json({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This application changed after the page loaded. Refresh before reviewing it.' });
        }
        const enabled = status === 'approved' || status === 'active';
        await admin.auth().setCustomUserClaims(uid, { ...(target.customClaims || {}), employer: enabled });
        await admin.auth().revokeRefreshTokens(uid);
        const batch = db.batch();
        batch.set(db.collection('users').doc(uid), {
            isEmployer: enabled,
            employerApplicationStatus: status,
            employerStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        batch.set(applicationRef, {
            status,
            ...(reason ? { rejectionReason: reason } : {}),
            reviewedBy: req.user.uid,
            reviewedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        batch.set(db.collection('security_audit_logs').doc(), {
            action: 'EMPLOYER_APPLICATION_REVIEWED', actorUid: req.user.uid, targetUid: uid,
            status, reason, requestId: res.locals.requestId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        return res.json({ success: true, status, employer: enabled });
    } catch (error) {
        console.error('[Employer review]', error.message);
        return res.status(error.code === 'auth/user-not-found' ? 404 : 500).json({ success: false, error: 'Unable to review employer application.' });
    }
});

function firestoreTimeMillis(value) {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    return date && Number.isFinite(date.getTime()) ? date.getTime() : null;
}

function safePublicUrl(value) {
    const raw = String(value || '').trim().slice(0, 2048);
    if (!raw || /[\u0000-\u001f\u007f]/.test(raw) || /%(?:0a|0d|00)/i.test(raw)) return '';
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    try { const parsed = new URL(raw); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : ''; }
    catch { return ''; }
}

app.post('/api/admin/ads', async (req, res) => {
    const requestDb = req.app.get('db');
    if (!requestDb || !admin) return res.status(503).json({ success: false, error: 'Advertisement service unavailable.' });
    const name = String(req.body?.name || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 120);
    const imageLink = safePublicUrl(req.body?.imageLink);
    const destinationLink = safePublicUrl(req.body?.destinationLink);
    if (!name || !imageLink || !destinationLink) return res.status(400).json({ success: false, error: 'Name, safe image URL, and safe destination URL are required.' });
    const reference = requestDb.collection('ads').doc();
    const batch = requestDb.batch();
    batch.set(reference, { id: reference.id, name, imageLink, destinationLink, revision: 1, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(requestDb.collection('security_audit_logs').doc(), { action: 'ADVERTISEMENT_CREATED', actorUid: req.user.uid, adId: reference.id, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    return res.json({ success: true, item: { id: reference.id, name, imageLink, destinationLink, revision: 1 } });
});

app.delete('/api/admin/ads/:adId', async (req, res) => {
    const requestDb = req.app.get('db');
    if (!requestDb || !admin) return res.status(503).json({ success: false, error: 'Advertisement service unavailable.' });
    const adId = String(req.params.adId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(adId)) return res.status(400).json({ success: false, error: 'Invalid advertisement ID.' });
    try {
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('ads').doc(adId);
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) { const error = new Error('Advertisement not found.'); error.code = 'NOT_FOUND'; throw error; }
            if (Number(req.body?.expectedRevision || 0) !== Number(snapshot.data()?.revision || 0)) { const error = new Error('Advertisement changed after this page loaded. Refresh before deleting.'); error.code = 'ADMIN_TARGET_CHANGED'; throw error; }
            transaction.delete(reference);
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'ADVERTISEMENT_DELETED', actorUid: req.user.uid, adId, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true });
    } catch (error) {
        const status = error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
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

app.get(['/public/custom-pages.json', '/api/public/custom-pages', '/api/custom-pages.json', '/custom-pages.json'], async (req, res) => {
    const requestDb = req.app.get('db') || db;
    try {
        if (requestDb) {
            const snapshot = await requestDb.collection('pages').get();
            const pages = snapshot.docs.filter(document => !document.data()?.status || document.data()?.status === 'published').map(document => ({ id: document.id, title: document.data()?.title || document.id }));
            res.setHeader('Cache-Control', 'no-store');
            return res.json({ success: true, pages });
        }
    } catch (_) {}
    return res.json({
        success: true,
        pages: [
            { id: 'about', title: 'About Us' },
            { id: 'terms', title: 'Terms of Service' },
            { id: 'privacy', title: 'Privacy Policy' }
        ]
    });
});

app.get('/api/admin/pages', async (req, res) => {
    const requestDb = req.app.get('db');
    if (!requestDb) return res.status(503).json({ success: false, error: 'Page service unavailable.' });
    const snapshot = await requestDb.collection('pages').get();
    const pages = snapshot.docs.map(document => {
        const value = document.data() || {};
        return { id: document.id, title: value.title || document.id, description: value.description || '', pagecontent: value.pagecontent || '', status: value.status || 'published', revision: Number(value.revision || 0), legacy: !value.status };
    });
    return res.json({ success: true, pages });
});

app.put('/api/admin/pages/:slug', async (req, res) => {
    const requestDb = req.app.get('db');
    const slug = String(req.params.slug || '').toLowerCase();
    const status = String(req.body?.status || 'draft').toLowerCase();
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!requestDb || !admin || !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug) || !['draft', 'published', 'unpublished'].includes(status) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid custom page request.' });
    try {
        const content = validateCustomPageContent(req.body?.pagecontent);
        const title = String(req.body?.title || slug).replace(/\p{Cc}/gu, ' ').trim().slice(0, 160) || slug;
        const description = String(req.body?.description || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
        let result;
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('pages').doc(slug);
            const snapshot = await transaction.get(reference);
            const current = snapshot.data() || {};
            const revision = Number(current.revision || 0);
            if (revision !== expectedRevision || (!snapshot.exists && expectedRevision !== 0)) { const conflict = new Error('This page changed after the editor loaded. Refresh before saving.'); conflict.code = 'CMS_PAGE_CONFLICT'; throw conflict; }
            const nextRevision = revision + 1;
            const event = !snapshot.exists ? 'CMS_PAGE_CREATED' : current.status !== status ? `CMS_PAGE_${status.toUpperCase()}` : 'CMS_PAGE_UPDATED';
            transaction.set(reference, { id: slug, title, description, pagecontent: content, status, revision: nextRevision, createdAt: current.createdAt || admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), publishedAt: status === 'published' ? (current.publishedAt || admin.firestore.FieldValue.serverTimestamp()) : null }, { merge: false });
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: event, actorUid: req.user.uid, pageId: slug, revision: nextRevision, status, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            result = { id: slug, title, description, pagecontent: content, status, revision: nextRevision };
        });
        return res.json({ success: true, page: result });
    } catch (error) {
        return res.status(error.code === 'CMS_PAGE_CONFLICT' ? 409 : 400).json({ success: false, code: error.code, error: error.message });
    }
});

app.delete('/api/admin/pages/:slug', async (req, res) => {
    const requestDb = req.app.get('db');
    const slug = String(req.params.slug || '').toLowerCase();
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!requestDb || !admin || !/^[a-z0-9-]{1,80}$/.test(slug) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid custom page deletion.' });
    try {
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('pages').doc(slug);
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) { const missing = new Error('Page not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            if (Number(snapshot.data()?.revision || 0) !== expectedRevision) { const conflict = new Error('This page changed after the list loaded. Refresh before deleting.'); conflict.code = 'CMS_PAGE_CONFLICT'; throw conflict; }
            transaction.delete(reference);
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'CMS_PAGE_DELETED', actorUid: req.user.uid, pageId: slug, revision: expectedRevision, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true });
    } catch (error) {
        const statusCode = error.code === 'CMS_PAGE_CONFLICT' ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(statusCode).json({ success: false, code: error.code, error: statusCode === 500 ? 'Unable to delete page.' : error.message });
    }
});

app.post('/api/admin/website-meta', async (req, res) => {
    const requestDb = req.app.get('db');
    if (!requestDb || !admin) return res.status(503).json({ success: false, error: 'Website metadata service unavailable.' });
    const allowedLanguages = new Set(['English','Hindi','Spanish','French','German','Italian','Portuguese','Russian','Polish','Dutch','Romanian','Danish','Swedish','Norwegian','Icelandic','Greek']);
    const changes = {};
    if (req.body.title !== undefined) changes.title = String(req.body.title).replace(/\p{Cc}/gu, ' ').trim().slice(0, 160);
    if (req.body.description !== undefined) changes.description = String(req.body.description).replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
    if (req.body.keywords !== undefined) changes.keywords = String(req.body.keywords).replace(/\p{Cc}/gu, ' ').trim().slice(0, 1000);
    if (req.body.language !== undefined) { if (!allowedLanguages.has(req.body.language)) return res.status(400).json({ success: false, error: 'Unsupported website language.' }); changes.language = req.body.language; }
    if (req.body.disabledLanguages !== undefined) changes.disabledLanguages = [...new Set((Array.isArray(req.body.disabledLanguages) ? req.body.disabledLanguages : []).filter(item => allowedLanguages.has(item)))];
    if (req.body.trackingCode !== undefined) { const code = String(req.body.trackingCode).trim(); if (code && !/^(G-[A-Z0-9]{10}|UA-[0-9]+-[0-9]+)$/.test(code)) return res.status(400).json({ success: false, error: 'Invalid analytics measurement ID.' }); changes.trackingCode = code; }
    if (!Object.keys(changes).length) return res.status(400).json({ success: false, error: 'No metadata changes supplied.' });
    try {
        let revision;
        await requestDb.runTransaction(async transaction => {
            const reference = requestDb.collection('data').doc('meta'); const snapshot = await transaction.get(reference); const current = Number(snapshot.data()?.revision || 0);
            if (Number(req.body.expectedRevision || 0) !== current) { const e = new Error('Website metadata changed after the panel loaded. Refresh before saving.'); e.code = 'ADMIN_TARGET_CHANGED'; throw e; }
            revision = current + 1;
            transaction.set(reference, { ...changes, revision, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'WEBSITE_METADATA_UPDATED', actorUid: req.user.uid, changedFields: Object.keys(changes), revision, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true, metadata: { ...changes, revision } });
    } catch (error) { return res.status(error.code === 'ADMIN_TARGET_CHANGED' ? 409 : 500).json({ success: false, code: error.code, error: error.code ? error.message : 'Unable to update website metadata.' }); }
});

app.post('/api/admin/landing-content', async (req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Landing-content service unavailable.' });
    const fields = ['activeJobs', 'rating', 'partnerCompanies', 'successfulHires', 'featuredJobs', 'successRate', 'topCompanies'];
    const content = Object.fromEntries(fields.map(field => [field, String(req.body?.content?.[field] || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 40)]));
    if (Object.values(content).some(value => !value || !/^[\p{L}\p{N}\s.,%+/-]{1,40}$/u.test(value))) return res.status(400).json({ success: false, error: 'All landing claims are required and must contain only short display text.' });
    const reference = db.collection('data').doc('frontendstats');
    try {
        let revision;
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            const currentRevision = Number(snapshot.data()?.revision || 0);
            if (Number(req.body.expectedRevision || 0) !== currentRevision) { const error = new Error('Landing content changed after this page loaded. Refresh before saving.'); error.code = 'ADMIN_TARGET_CHANGED'; throw error; }
            revision = currentRevision + 1;
            transaction.set(reference, { ...content, revision, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: req.user.uid });
            transaction.set(db.collection('security_audit_logs').doc(), { action: 'LANDING_CONTENT_UPDATED', actorUid: req.user.uid, revision, changedFields: fields, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true, content: { ...content, revision } });
    } catch (error) { return res.status(error.code === 'ADMIN_TARGET_CHANGED' ? 409 : 500).json({ success: false, code: error.code, error: error.code ? error.message : 'Unable to save landing content.' }); }
});

app.get(['/public/trusted-by.json', '/api/public/trusted-by', '/api/trusted-by.json', '/trusted-by.json'], async (req, res) => {
    const requestDb = req.app.get('db') || db;
    try {
        if (requestDb) {
            const snapshot = await requestDb.collection('trustedBy').get();
            const items = snapshot.docs.map(document => ({ id: document.id, ...document.data() })).filter(item => item.published !== false).sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name || '').localeCompare(String(b.name || '')));
            res.setHeader('Cache-Control', 'no-store');
            return res.json({ success: true, items });
        }
    } catch (_) {}
    return res.json({
        success: true,
        items: [
            { id: 'google', name: 'Google', url: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg' },
            { id: 'microsoft', name: 'Microsoft', url: 'https://upload.wikimedia.org/wikipedia/commons/9/96/Microsoft_logo_%282012%29.svg' },
            { id: 'amazon', name: 'Amazon', url: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg' }
        ]
    });
});

app.get('/api/admin/trusted-by', async (_req, res) => {
    if (!db) return res.status(503).json({ success: false, error: 'Trusted-logo service unavailable.' });
    const snapshot = await db.collection('trustedBy').get();
    const items = snapshot.docs.map(document => ({ id: document.id, ...document.data(), revision: Number(document.data()?.revision || 0) })).sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name || '').localeCompare(String(b.name || '')));
    return res.json({ success: true, items });
});

app.post('/api/admin/trusted-by', async (req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Trusted-logo service unavailable.' });
    try {
        const data = normalizeTrustedLogo(req.body);
        const reference = db.collection('trustedBy').doc();
        const batch = db.batch();
        batch.set(reference, { ...data, id: reference.id, revision: 1, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.set(db.collection('security_audit_logs').doc(), { action: 'TRUSTED_LOGO_CREATED', actorUid: req.user.uid, logoId: reference.id, published: data.published, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        return res.json({ success: true, item: { ...data, id: reference.id, revision: 1 } });
    } catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});

app.patch('/api/admin/trusted-by/:logoId', async (req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Trusted-logo service unavailable.' });
    const logoId = String(req.params.logoId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(logoId)) return res.status(400).json({ success: false, error: 'Invalid logo ID.' });
    try {
        const data = normalizeTrustedLogo(req.body);
        let result;
        await db.runTransaction(async transaction => {
            const reference = db.collection('trustedBy').doc(logoId);
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) { const error = new Error('Logo not found.'); error.code = 'NOT_FOUND'; throw error; }
            const revision = Number(snapshot.data()?.revision || 0);
            if (Number(req.body.expectedRevision || 0) !== revision) { const error = new Error('This logo changed after the page loaded. Refresh before saving.'); error.code = 'ADMIN_TARGET_CHANGED'; throw error; }
            result = { ...data, id: logoId, revision: revision + 1 };
            transaction.update(reference, { ...data, id: logoId, revision: revision + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            transaction.set(db.collection('security_audit_logs').doc(), { action: 'TRUSTED_LOGO_UPDATED', actorUid: req.user.uid, logoId, revision: revision + 1, published: data.published, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true, item: result });
    } catch (error) { const status = error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : 400; return res.status(status).json({ success: false, code: error.code, error: error.message }); }
});

app.delete('/api/admin/trusted-by/:logoId', async (req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Trusted-logo service unavailable.' });
    const logoId = String(req.params.logoId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(logoId)) return res.status(400).json({ success: false, error: 'Invalid logo ID.' });
    try {
        await db.runTransaction(async transaction => {
            const reference = db.collection('trustedBy').doc(logoId);
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) { const error = new Error('Logo not found.'); error.code = 'NOT_FOUND'; throw error; }
            if (Number(req.body?.expectedRevision || 0) !== Number(snapshot.data()?.revision || 0)) { const error = new Error('This logo changed after the page loaded. Refresh before deleting.'); error.code = 'ADMIN_TARGET_CHANGED'; throw error; }
            transaction.delete(reference);
            transaction.set(db.collection('security_audit_logs').doc(), { action: 'TRUSTED_LOGO_DELETED', actorUid: req.user.uid, logoId, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true });
    } catch (error) { const status = error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : 500; return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete logo.' : error.message }); }
});

app.post('/api/admin/reviews', async (req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Review service unavailable.' });
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
    const reference = db.collection('reviews').doc();
    const batch = db.batch();
    batch.set(reference, { name, occupation, review, rating, imageUrl, status: 'approved', revision: 1, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('security_audit_logs').doc(), { action: 'REVIEW_CREATED', actorUid: req.user.uid, reviewId: reference.id, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    return res.json({ success: true, id: reference.id, revision: 1 });
});

app.delete('/api/admin/reviews/:reviewId', async (req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Review service unavailable.' });
    const reviewId = String(req.params.reviewId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(reviewId)) return res.status(400).json({ success: false, error: 'Invalid review ID.' });
    try {
        await db.runTransaction(async transaction => {
            const reference = db.collection('reviews').doc(reviewId);
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) { const missing = new Error('Review not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            const currentRevision = Number(snapshot.data()?.revision || 0);
            if (Number(req.body?.expectedRevision || 0) !== currentRevision) { const conflict = new Error('This review changed after the page loaded. Refresh before deleting it.'); conflict.code = 'ADMIN_TARGET_CHANGED'; throw conflict; }
            transaction.delete(reference);
            transaction.set(db.collection('security_audit_logs').doc(), { action: 'REVIEW_DELETED', actorUid: req.user.uid, reviewId, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return res.json({ success: true });
    } catch (error) {
        const status = error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete review.' : error.message });
    }
});

app.post('/api/admin/global-rating', async (req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Rating service unavailable.' });
    const rating = Number(req.body?.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return res.status(400).json({ success: false, error: 'Rating must be from 1 to 5.' });
    const batch = db.batch();
    batch.set(db.collection('data').doc('meta'), { rating, ratingUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    batch.set(db.collection('security_audit_logs').doc(), { action: 'GLOBAL_RATING_UPDATED', actorUid: req.user.uid, rating, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    return res.json({ success: true, rating });
});

app.patch('/api/admin/companies/:companyId', async (req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Company administration unavailable.' });
    const companyId = String(req.params.companyId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(companyId)) return res.status(400).json({ success: false, error: 'Invalid company ID.' });
    const hasStatus = Object.hasOwn(req.body, 'status');
    const hasFeatured = Object.hasOwn(req.body, 'featured');
    if (Number(hasStatus) + Number(hasFeatured) !== 1) return res.status(400).json({ success: false, error: 'Exactly one company change is allowed per request.' });
    const status = String(req.body.status || '').toLowerCase();
    if (hasStatus && !['approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid company status.' });
    if (hasStatus && status === 'rejected' && !String(req.body.reason || '').trim()) return res.status(400).json({ success: false, error: 'A rejection reason is required.' });
    if (hasFeatured && typeof req.body.featured !== 'boolean') return res.status(400).json({ success: false, error: 'Invalid featured state.' });
    const reference = db.collection('companies').doc(companyId);
    try {
        const result = await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) { const missing = new Error('Company not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            const company = snapshot.data() || {};
            const expectedUpdatedAt = req.body.expectedUpdatedAt === undefined ? null : Number(req.body.expectedUpdatedAt);
            const stale = (Object.hasOwn(req.body, 'expectedStatus') && String(company.status || 'pending') !== String(req.body.expectedStatus))
                || (Object.hasOwn(req.body, 'expectedFeatured') && Boolean(company.featured) !== Boolean(req.body.expectedFeatured))
                || (expectedUpdatedAt !== null && expectedUpdatedAt !== firestoreTimeMillis(company.updatedAt));
            if (stale) { const conflict = new Error('This company changed after the page loaded. Refresh before changing it.'); conflict.code = 'ADMIN_TARGET_CHANGED'; throw conflict; }
            const reason = String(req.body.reason || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
            const changes = hasStatus
                ? { status, ...(status === 'approved' ? { approvedAt: admin.firestore.FieldValue.serverTimestamp(), rejectionReason: null } : { rejectedAt: admin.firestore.FieldValue.serverTimestamp(), rejectionReason: reason }), updatedAt: admin.firestore.FieldValue.serverTimestamp() }
                : { featured: req.body.featured, featuredAt: req.body.featured ? admin.firestore.FieldValue.serverTimestamp() : null, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
            transaction.update(reference, changes);
            if (hasStatus && company.employerId) {
                const name = String(company.name || 'Company').replace(/\p{Cc}/gu, ' ').slice(0, 160);
                transaction.set(db.collection('notifications').doc(company.employerId).collection('userNotifications').doc(), {
                    type: 'company_status_update', title: 'Company review updated', message: `${name} is now ${status}.`,
                    data: { companyId, status }, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            transaction.set(db.collection('security_audit_logs').doc(), {
                action: hasStatus ? 'COMPANY_STATUS_UPDATED' : 'COMPANY_FEATURED_UPDATED', actorUid: req.user.uid, companyId,
                ...(hasStatus ? { status, reason: reason || null } : { featured: req.body.featured }), requestId: res.locals.requestId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { status: hasStatus ? status : company.status, featured: hasFeatured ? req.body.featured : Boolean(company.featured) };
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        const responseStatus = error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(responseStatus).json({ success: false, code: error.code, error: responseStatus === 500 ? 'Unable to update company.' : error.message });
    }
});

app.patch('/api/admin/jobs/:jobId', async (req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Job administration unavailable.' });
    const jobId = String(req.params.jobId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return res.status(400).json({ success: false, error: 'Invalid job ID.' });
    const hasStatus = Object.hasOwn(req.body, 'status');
    const hasFeatured = Object.hasOwn(req.body, 'isFeatured');
    if (Number(hasStatus) + Number(hasFeatured) !== 1) return res.status(400).json({ success: false, error: 'Exactly one job change is allowed per request.' });
    const status = String(req.body.status || '').toLowerCase();
    if (hasStatus && !['active', 'pending', 'inactive', 'archived'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid job status.' });
    if (hasFeatured && typeof req.body.isFeatured !== 'boolean') return res.status(400).json({ success: false, error: 'Invalid featured state.' });
    const reference = db.collection('jobs').doc(jobId);
    try {
        const result = await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) {
                const missing = new Error('Job not found.'); missing.code = 'NOT_FOUND'; throw missing;
            }
            const job = snapshot.data() || {};
            const expectedUpdatedAt = req.body.expectedUpdatedAt === undefined ? null : Number(req.body.expectedUpdatedAt);
            const stale = (Object.hasOwn(req.body, 'expectedStatus') && String(job.status || 'pending') !== String(req.body.expectedStatus))
                || (Object.hasOwn(req.body, 'expectedFeatured') && Boolean(job.isFeatured) !== Boolean(req.body.expectedFeatured))
                || (expectedUpdatedAt !== null && expectedUpdatedAt !== firestoreTimeMillis(job.updatedAt));
            if (stale) { const conflict = new Error('This job changed after the page loaded. Refresh before changing it.'); conflict.code = 'ADMIN_TARGET_CHANGED'; throw conflict; }
            const changes = hasStatus
                ? { status, updatedAt: admin.firestore.FieldValue.serverTimestamp() }
                : { isFeatured: req.body.isFeatured, featuredAt: req.body.isFeatured ? admin.firestore.FieldValue.serverTimestamp() : null, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
            transaction.update(reference, changes);
            if (hasStatus && job.employerId) {
                const safeTitle = String(job.title || 'Job posting').replace(/\p{Cc}/gu, ' ').slice(0, 160);
                const notificationRef = db.collection('notifications').doc(job.employerId).collection('userNotifications').doc();
                transaction.set(notificationRef, {
                    type: 'job_status_update', title: 'Job status updated',
                    message: `Your job posting “${safeTitle}” is now ${status}.`,
                    data: { jobId, status }, read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            transaction.set(db.collection('security_audit_logs').doc(), {
                action: hasStatus ? 'JOB_STATUS_UPDATED' : 'JOB_FEATURED_UPDATED', actorUid: req.user.uid,
                jobId, ...(hasStatus ? { status } : { isFeatured: req.body.isFeatured }), requestId: res.locals.requestId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { status: hasStatus ? status : job.status, isFeatured: hasFeatured ? req.body.isFeatured : Boolean(job.isFeatured) };
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        const responseStatus = error.code === 'ADMIN_TARGET_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(responseStatus).json({ success: false, code: error.code, error: responseStatus === 500 ? 'Unable to update job.' : error.message });
    }
});

app.delete('/api/admin/jobs/:jobId', async (req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Job administration unavailable.' });
    const jobId = String(req.params.jobId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return res.status(400).json({ success: false, error: 'Invalid job ID.' });
    try {
        const reference = db.collection('jobs').doc(jobId);
        const applicationsQuery = db.collection('jobApplications').where('jobId', '==', jobId).limit(1);
        await db.runTransaction(async transaction => {
            const [snapshot, applications] = await Promise.all([transaction.get(reference), transaction.get(applicationsQuery)]);
            if (!snapshot.exists) { const missing = new Error('Job not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            if (!applications.empty) { const conflict = new Error('This job has applications and must be archived instead of deleted.'); conflict.code = 'JOB_HAS_APPLICATIONS'; throw conflict; }
            const job = snapshot.data() || {};
            const expectedUpdatedAt = req.body?.expectedUpdatedAt === undefined ? null : Number(req.body.expectedUpdatedAt);
            if ((Object.hasOwn(req.body || {}, 'expectedStatus') && String(job.status || 'pending') !== String(req.body.expectedStatus))
                || (expectedUpdatedAt !== null && expectedUpdatedAt !== firestoreTimeMillis(job.updatedAt))) {
                const conflict = new Error('This job changed after the page loaded. Refresh before deleting it.'); conflict.code = 'ADMIN_TARGET_CHANGED'; throw conflict;
            }
            transaction.delete(reference);
            transaction.set(db.collection('security_audit_logs').doc(), {
                action: 'JOB_DELETED', actorUid: req.user.uid, jobId, previousStatus: job.status || 'pending',
                requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        return res.json({ success: true });
    } catch (error) {
        const responseStatus = ['ADMIN_TARGET_CHANGED', 'JOB_HAS_APPLICATIONS'].includes(error.code) ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
        return res.status(responseStatus).json({ success: false, code: error.code, error: responseStatus === 500 ? 'Unable to delete job.' : error.message });
    }
});

// Authoritative Super Admin User Directory, User 360, AI Entitlements,
// Platform Currency, Subscriptions Lifecycle, and Tenant Governance Routers.
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin', adminPlatformOperationsRouter);
async function deleteApplicationNotifications(database, applicationIds) {
    for (const applicationId of applicationIds) {
        try {
            const notifications = await database.collectionGroup('userNotifications').where('data.applicationId', '==', applicationId).get();
            for (const notification of notifications.docs) await database.recursiveDelete(notification.ref);
        } catch (e) {
            console.warn(`[deleteApplicationNotifications] Failed to cleanup notifications for app ${applicationId}:`, e.message);
        }
    }
}

async function removeDeletedUserFromRealtimeMessaging(uid, identityAdmin = admin) {
    if (!identityAdmin?.database) throw new Error('Realtime Database is unavailable');
    let realtime;
    try { realtime = identityAdmin.database(); } catch (e) { return; }
    const indexSnapshot = await realtime.ref(`user-conversations/${uid}`).get();
    const conversationIds = Object.keys(indexSnapshot.val() || {});
    for (const conversationId of conversationIds) {
        const deletedParticipantId = `deleted_${crypto.randomBytes(10).toString('hex')}`;
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(conversationId)) continue;
        const [conversationSnapshot, messagesSnapshot] = await Promise.all([
            realtime.ref(`conversations/${conversationId}`).get(),
            realtime.ref(`messages/${conversationId}`).get(),
        ]);
        if (!conversationSnapshot.exists() || conversationSnapshot.child(`participants/${uid}`).val() !== true) continue;
        const participantIds = Object.keys(conversationSnapshot.child('participants').val() || {}).sort();
        const lookupKey = crypto.createHash('sha256').update(participantIds.join('\0')).digest('hex');
        const remainingAccounts = participantIds.filter(participantId => participantId !== uid && !participantId.startsWith('deleted_'));
        const updates = {
            [`user-conversations/${uid}/${conversationId}`]: null,
            [`conversation-participants/${lookupKey}`]: null,
        };
        if (!remainingAccounts.length) {
            updates[`conversations/${conversationId}`] = null;
            updates[`messages/${conversationId}`] = null;
        } else {
            updates[`conversations/${conversationId}/participants/${uid}`] = null;
            updates[`conversations/${conversationId}/participants/${deletedParticipantId}`] = true;
            updates[`conversations/${conversationId}/applicationId`] = null;
            updates[`conversations/${conversationId}/deletedAt`] = { '.sv': 'timestamp' };
            messagesSnapshot.forEach(message => {
                if (message.child('senderId').val() === uid) updates[`messages/${conversationId}/${message.key}`] = null;
            });
        }
        await realtime.ref().update(updates);
    }
    await realtime.ref(`user-conversations/${uid}`).remove();
    return { conversationCount: conversationIds.length };
}

app.post('/api/account/delete', async (req, res) => {
    if (!db || !admin?.auth) return res.status(503).json({ success: false, error: 'Account deletion service unavailable.' });
    const uid = req.user.uid;
    const failures = [];
    try {
        const jobs = await db.collection('jobs').where('employerId', '==', uid).get().catch(() => { failures.push('employer jobs'); return { docs: [] }; });
        for (const job of jobs.docs) {
            // Applications belong to their applicants and retain a bounded job snapshot.
            // Deleting an employer removes the posting, not another account's application history.
            try { await db.recursiveDelete(job.ref); }
            catch { failures.push(`job:${job.id}`); }
        }
        try {
            const applications = await db.collection('jobApplications').where('userId', '==', uid).get();
            const applicationIds = applications.docs.map(application => application.id);
            for (const application of applications.docs) await db.recursiveDelete(application.ref);
            await deleteApplicationNotifications(db, applicationIds);
        } catch { failures.push('job applications'); }
        const queries = [
            ['portfolios', db.collection('portfolios').where('userId', '==', uid)],
            ['published portfolios', db.collection('pb').where('ownerUid', '==', uid)],
            ['blog posts', db.collection('blog_posts').where('authorUid', '==', uid)],
            ['companies', db.collection('companies').where('employerId', '==', uid)],
        ];
        for (const [label, query] of queries) {
            try { const snapshot = await query.get(); for (const item of snapshot.docs) await db.recursiveDelete(item.ref); }
            catch { failures.push(label); }
        }
        for (const [label, reference] of [['employer application', db.collection('employerApplications').doc(uid)], ['notifications', db.collection('notifications').doc(uid)]]) {
            try { await db.recursiveDelete(reference); } catch { failures.push(label); }
        }
        try { await removeDeletedUserFromRealtimeMessaging(uid); } catch { failures.push('realtime messaging'); }
        if (!failures.length) try { await db.recursiveDelete(db.collection('users').doc(uid)); } catch { failures.push('user profile tree'); }
        if (failures.length) {
            await db.collection('security_audit_logs').add({ action: 'ACCOUNT_SELF_DELETION_INCOMPLETE', targetUid: uid, cleanupFailures: failures, requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            return res.status(500).json({ success: false, code: 'ACCOUNT_CLEANUP_INCOMPLETE', error: `Cleanup failed for: ${failures.join(', ')}. Your identity remains active; retry deletion.` });
        }
        try { await admin.auth().deleteUser(uid); }
        catch {
            await db.collection('security_audit_logs').add({ action: 'ACCOUNT_SELF_DELETION_INCOMPLETE', targetUid: uid, cleanupFailures: ['firebase identity'], requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            return res.status(500).json({ success: false, code: 'ACCOUNT_IDENTITY_DELETE_FAILED', error: 'Owned application data was removed, but the Firebase identity could not be deleted. Contact support immediately.' });
        }
        await db.collection('security_audit_logs').add({ action: 'ACCOUNT_SELF_DELETED', targetUid: uid, retainedRecordTypes: ['payment_orders', 'invoices', 'transactions', 'subscriptions', 'security_audit_logs'], requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        return res.json({ success: true, message: 'Identity and owned profile, resume, portfolio, CMS, employer, job, application, notification, and messaging data were deleted.', retainedRecordTypes: ['payment_orders', 'invoices', 'transactions', 'subscriptions', 'security_audit_logs'] });
    } catch (error) {
        console.error('[Account self-delete]', error.message);
        return res.status(500).json({ success: false, error: 'Unable to complete account deletion. Identity remains active unless the response explicitly confirms success.' });
    }
});

// Administrative deletion is explicit, recently authenticated, and recursive.
app.post(['/api/admin/delete-user', '/api/auth/purge-orphaned-auth'], requireRecentAdminAuthentication, async (req, res) => {
    const requestedUid = String(req.body?.uid || '').trim();
    const requestedEmail = String(req.body?.email || '').trim().toLowerCase();
    const requestDb = req.app.get('db');
    const identityAdmin = req.app.get('firebaseAdmin') || admin;
    if ((!requestedUid && !requestedEmail) || !requestDb || !identityAdmin?.auth) {
        return res.status(400).json({ success: false, code: 'USER_DELETE_INPUT_INVALID', error: 'User UID or email is required.' });
    }
    if (requestedUid && !/^[A-Za-z0-9:_-]{1,128}$/.test(requestedUid)) {
        return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user UID.' });
    }
    if (requestedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
        return res.status(400).json({ success: false, code: 'INVALID_EMAIL', error: 'Invalid user email.' });
    }

    try {
        let target = null;
        try {
            target = requestedUid ? await identityAdmin.auth().getUser(requestedUid) : await identityAdmin.auth().getUserByEmail(requestedEmail);
        } catch (error) {
            if (error.code !== 'auth/user-not-found' || !requestedUid) throw error;
        }
        const targetUid = target?.uid || requestedUid;
        if (!/^[A-Za-z0-9:_-]{1,128}$/.test(targetUid)) return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user UID.' });
        if (targetUid === req.user.uid) return res.status(400).json({ success: false, code: 'SELF_DELETION_PROHIBITED', error: 'Self-deletion through the admin endpoint is prohibited.' });

        const profileSnapshot = await requestDb.collection('users').doc(targetUid).get();
        if (!target && !profileSnapshot.exists) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found.' });
        const profileData = profileSnapshot.data() || {};
        const authoritativeEmail = String(target?.email || profileData.email || '').toLowerCase();
        if (requestedEmail && authoritativeEmail && authoritativeEmail !== requestedEmail) {
            return res.status(400).json({ success: false, code: 'USER_IDENTITY_MISMATCH', error: 'UID/email identity mismatch.' });
        }
        const targetRole = String(target?.customClaims?.role || profileData.role || '').toUpperCase();
        if (targetRole === 'SUPER_ADMIN' && !isSuperAdmin(req.user)) {
            return res.status(403).json({ success: false, code: 'SUPER_ADMIN_PROTECTED', error: 'Only SUPER_ADMIN can delete another SUPER_ADMIN.' });
        }

        // Clean application-owned data before deleting the Auth identity. If any
        // cleanup fails, the account remains recoverable and the operator gets a
        // retryable failure instead of an orphaned/deleted half-state.
        const cleanupFailures = [];
        try {
            const ownedJobs = await requestDb.collection('jobs').where('employerId', '==', targetUid).get();
            for (const job of ownedJobs.docs) await requestDb.recursiveDelete(job.ref);
        } catch { cleanupFailures.push('employer jobs'); }
        try {
            const applications = await requestDb.collection('jobApplications').where('userId', '==', targetUid).get();
            const applicationIds = applications.docs.map(application => application.id);
            for (const application of applications.docs) await requestDb.recursiveDelete(application.ref);
            await deleteApplicationNotifications(requestDb, applicationIds);
        } catch { cleanupFailures.push('job applications'); }
        const relatedQueries = [
            ['portfolios', requestDb.collection('portfolios').where('userId', '==', targetUid)],
            ['published portfolios', requestDb.collection('pb').where('ownerUid', '==', targetUid)],
            ['blog posts', requestDb.collection('blog_posts').where('authorUid', '==', targetUid)],
            ['companies', requestDb.collection('companies').where('employerId', '==', targetUid)],
        ];
        for (const [label, query] of relatedQueries) {
            try {
                const snapshot = await query.get();
                for (const item of snapshot.docs) await requestDb.recursiveDelete(item.ref);
            } catch (error) {
                cleanupFailures.push(label);
                console.warn(`[User deletion ${label}]`, error.message);
            }
        }
        for (const [label, reference] of [
            ['employer application', requestDb.collection('employerApplications').doc(targetUid)],
            ['notifications', requestDb.collection('notifications').doc(targetUid)],
        ]) {
            try { await requestDb.recursiveDelete(reference); } catch { cleanupFailures.push(label); }
        }
        try { await removeDeletedUserFromRealtimeMessaging(targetUid, identityAdmin); } catch { cleanupFailures.push('realtime messaging'); }
        if (!cleanupFailures.length) {
            try { await requestDb.recursiveDelete(requestDb.collection('users').doc(targetUid)); }
            catch { cleanupFailures.push('user profile tree'); }
        }

        const auditRef = requestDb.collection('security_audit_logs').doc();
        const auditPayload = {
            action: cleanupFailures.length ? 'USER_DELETION_INCOMPLETE' : 'USER_DELETED',
            actorUid: req.user.uid, targetUid, cleanupFailures,
            requestId: res.locals.requestId, createdAt: identityAdmin.firestore?.FieldValue?.serverTimestamp?.() || new Date(),
        };
        if (cleanupFailures.length) {
            await auditRef.set(auditPayload).catch(() => {});
            return res.status(500).json({
                success: false, code: 'USER_CLEANUP_INCOMPLETE',
                error: `Cleanup failed for: ${cleanupFailures.join(', ')}. The identity was retained; retry this operation.`,
            });
        }

        if (target) {
            try { await identityAdmin.auth().deleteUser(targetUid); }
            catch (error) {
                await auditRef.set({ ...auditPayload, action: 'USER_IDENTITY_DELETE_FAILED', cleanupFailures: ['firebase identity'], failureCategory: error.code || 'AUTH_DELETE_FAILED' }).catch(() => {});
                return res.status(500).json({ success: false, code: 'USER_IDENTITY_DELETE_FAILED', error: 'Owned application data was removed, but the Firebase identity could not be deleted. Retry immediately.' });
            }
        }
        await auditRef.set(auditPayload).catch(() => {});
        return res.json({ success: true, deletedFromAuth: Boolean(target), message: 'User identity, profile tree, portfolios, applications, employer content, notifications, messaging data, and authored blog posts were deleted.' });
    } catch (error) {
        console.error('[Admin delete user]', error.message);
        return res.status(error.code === 'auth/user-not-found' ? 404 : 500).json({ success: false, code: error.code === 'auth/user-not-found' ? 'USER_NOT_FOUND' : 'USER_DELETE_FAILED', error: 'Unable to delete user.' });
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
    if (!db || !admin?.auth) return res.status(503).json({ success: false, error: 'Password reset service unavailable.' });
    const tokenHash = hashToken(token);
    const ref = db.collection('password_reset_tokens').doc(tokenHash);
    const leaseId = crypto.randomUUID();
    try {
        // Atomically reserve the token. A concurrent request cannot acquire the same token.
        await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            const record = snap.data();
            const stateRef = record?.uid ? db.collection('password_reset_state').doc(record.uid) : null;
            const stateSnap = stateRef ? await tx.get(stateRef) : null;
            if (!snap.exists || !stateSnap?.exists) throw new Error('INVALID_RESET_TOKEN');
            assertTokenRecord({ record, state: stateSnap.data(), email, tokenHash });
            tx.update(ref, { leaseId, leaseExpiresAt: Date.now() + 60_000 });
        });
        const user = await admin.auth().getUserByEmail(email);
        const record = (await ref.get()).data();
        if (!record || record.uid !== user.uid) throw new Error('INVALID_RESET_TOKEN');
        assertLeaseOwner(record, leaseId);
        await admin.auth().updateUser(user.uid, { password: newPassword });
        await admin.auth().revokeRefreshTokens(user.uid);
        await db.runTransaction(async tx => {
            const latest = await tx.get(ref);
            if (!latest.exists) throw new Error('INVALID_RESET_TOKEN');
            assertLeaseOwner(latest.data(), leaseId);
            tx.update(ref, { usedAt: admin.firestore.FieldValue.serverTimestamp(), leaseId: admin.firestore.FieldValue.delete(), leaseExpiresAt: admin.firestore.FieldValue.delete() });
            tx.set(db.collection('password_reset_state').doc(user.uid), {
                activeTokenHash: admin.firestore.FieldValue.delete(),
                consumedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
        // Release a lease only when this request owns it; do not make an already-used token reusable.
        try { const snap = await ref.get(); if (snap.exists && snap.data().leaseId === leaseId) await ref.update({ leaseId: admin.firestore.FieldValue.delete(), leaseExpiresAt: admin.firestore.FieldValue.delete() }); } catch (_) {}
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
function respondToDeliveryAttempt(res, delivery, label) {
    // The notifier returns undefined when the caller omitted the recipient, so
    // nothing was ever dispatched. That is a bad request, not a mail outage —
    // reporting it as 502 blamed the mail provider for a client-side omission.
    if (delivery === undefined || delivery === null) {
        return res.status(400).json({
            success: false,
            deliveryState: 'NOT_ATTEMPTED',
            code: 'NOTIFICATION_RECIPIENT_REQUIRED',
            message: `${label} was not sent because no recipient address was supplied.`,
        });
    }

    const state = delivery?.deliveryState || 'DELIVERY_FAILED';
    const attempted = state === 'DELIVERY_ATTEMPTED';
    const notConfigured = state === 'NOT_CONFIGURED';

    if (attempted) {
        return res.status(202).json({
            success: true,
            deliveryState: state,
            providerAccepted: delivery?.providerAccepted === true,
            message: `${label} delivery was attempted and accepted by the configured provider.`,
        });
    }

    if (notConfigured) {
        return res.status(503).json({
            success: false,
            deliveryState: state,
            configurationState: 'NOT_CONFIGURED',
            providerAccepted: false,
            code: 'EMAIL_NOT_CONFIGURED',
            message: `${label} was not sent because no email provider is configured for this deployment.`,
            remediation: 'Configure SMTP credentials in Admin → Settings → Email, then retry.',
        });
    }

    return res.status(502).json({
        success: false,
        deliveryState: state,
        providerAccepted: false,
        code: delivery?.code || 'EMAIL_DELIVERY_FAILED',
        message: `${label} delivery failed.`,
    });
}

app.post('/api/notify/password-changed', async (req, res) => {
    const { userEmail, userName } = req.body;
    const delivery = await EmailNotifier.notifyPasswordChanged(req.app.get('db'), { userEmail, userName });
    return respondToDeliveryAttempt(res, delivery, 'Password-change email');
});

app.post('/api/notify/email-otp', (req, res) => {
    return res.status(410).json({ error: { code: 'CLIENT_OTP_RETIRED', message: 'Use the account-bound email verification link flow', requestId: res.locals.requestId } });
});

app.post('/api/notify/security-alert', async (req, res) => {
    const { userEmail, deviceInfo, ipAddress } = req.body;
    const delivery = await EmailNotifier.notifySecurityAlert(req.app.get('db'), { userEmail, deviceInfo, ipAddress });
    return respondToDeliveryAttempt(res, delivery, 'Security alert');
});

app.post('/api/notify/portfolio-published', async (req, res) => {
    const { userEmail, userName, portfolioSlug } = req.body;
    const delivery = await EmailNotifier.notifyPortfolioPublished(req.app.get('db'), { userEmail, userName, portfolioSlug });
    return respondToDeliveryAttempt(res, delivery, 'Portfolio email');
});

app.post('/api/notify/job-application', async (req, res) => {
    const { recruiterEmail, applicantName, jobTitle, companyName } = req.body;
    const delivery = await EmailNotifier.notifyJobApplicationReceived(req.app.get('db'), { recruiterEmail, applicantName, jobTitle, companyName });
    return respondToDeliveryAttempt(res, delivery, 'Job-application email');
});

app.post('/api/notify/job-status-update', async (req, res) => {
    const { applicantEmail, applicantName, jobTitle, companyName, status } = req.body;
    const delivery = await EmailNotifier.notifyJobStatusUpdate(req.app.get('db'), { applicantEmail, applicantName, jobTitle, companyName, status });
    return respondToDeliveryAttempt(res, delivery, 'Job-status email');
});

app.post('/api/notify/job-posted', async (req, res) => {
    const { employerEmail, jobTitle, companyName } = req.body;
    const delivery = await EmailNotifier.notifyJobPosted(req.app.get('db'), { employerEmail, jobTitle, companyName });
    return respondToDeliveryAttempt(res, delivery, 'Job-posted email');
});

app.post('/api/notify/subscription-cancelled', async (req, res) => {
    const { userEmail, userName, planName } = req.body;
    const delivery = await EmailNotifier.notifySubscriptionCancelled(req.app.get('db'), { userEmail, userName, planName });
    return respondToDeliveryAttempt(res, delivery, 'Subscription-cancellation email');
});

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

async function getSocialAuthCredentials(provider, database = db) {
    let storedClientId = '';
    let storedClientSecret = '';
    const legacyPrefix = provider === 'linkedin' ? 'linkedin' : 'github';
    try {
        if (database) {
            const [providerSecrets, adminConfiguration, legacySettings] = await Promise.all([
                database.collection('settings').doc('oauth_providers').get(),
                database.collection('settings').doc('admin_configuration').get(),
                database.collection('data').doc('system_settings').get(),
            ]);
            const providerConfig = providerSecrets.data()?.[provider] || {};
            const canonical = adminConfiguration.data()?.socialAuth || {};
            const legacy = legacySettings.data()?.socialAuth || {};
            storedClientId = String(providerConfig.clientId || canonical[`${legacyPrefix}ClientId`] || legacy[`${legacyPrefix}ClientId`] || '').trim();
            storedClientSecret = String(providerConfig.clientSecret || canonical[`${legacyPrefix}ClientSecret`] || legacy[`${legacyPrefix}ClientSecret`] || '').trim();
        }
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
        // No datastore means we cannot mint or verify the anti-CSRF state, so the
        // flow genuinely cannot start. That is an outage, not a misconfiguration.
        if (!db) {
            console.warn(`[OAuth begin ${provider}] state store unavailable`);
            return failOAuthBegin(res, provider, 'oauth_unavailable');
        }
        const { clientId, clientSecret } = await getSocialAuthCredentials(provider, req.app.get('db'));
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
        await db.collection('oauth_states').doc(hashOpaque(state)).create({ provider, codeVerifier, expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
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
    const ref = db.collection('oauth_states').doc(hashOpaque(state));
    let record;
    await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        record = snap.data();
        if (!snap.exists) throw new Error('OAUTH_STATE_INVALID');
        assertStateRecord(record, provider);
        tx.delete(ref);
    });
    return record;
}

async function upsertFederatedIdentity({ provider, providerId, email, emailVerified, displayName, photoURL }) {
    if (!admin?.auth || !db) throw new Error('OAUTH_IDENTITY_INVALID');
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
    const isNew = !providerUser;
    const user = providerUser || await admin.auth().createUser({
        uid: providerUid,
        email: normalizedEmail,
        emailVerified: true,
        displayName: String(displayName || 'User').slice(0, 100),
        photoURL: photoURL || undefined
    });
    if (!user.emailVerified) await admin.auth().updateUser(user.uid, { emailVerified: true });
    const parts = String(displayName || 'User').trim().split(/\s+/);
    const userRef = db.collection('users').doc(user.uid);
    const existing = await userRef.get();
    await userRef.set({
        userId: user.uid,
        email: normalizedEmail,
        firstname: parts[0] || 'User',
        lastname: parts.slice(1).join(' '),
        displayName: String(displayName || 'User').slice(0, 100),
        ...(photoURL ? { photoURL } : {}),
        authProviders: admin.firestore.FieldValue.arrayUnion(provider),
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(!existing.exists ? { membership: 'Basic', createdAt: admin.firestore.FieldValue.serverTimestamp() } : {})
    }, { merge: true });
    if (isNew) EmailNotifier.notifyOAuthNewUser(db, { userEmail: normalizedEmail, userName: displayName, provider }).catch(() => {});
    return user.uid;
}

async function issueOAuthExchange(uid, provider) {
    const code = crypto.randomBytes(32).toString('base64url');
    await db.collection('oauth_exchange_codes').doc(hashOpaque(code)).create({ uid, provider, expiresAt: Date.now() + OAUTH_EXCHANGE_TTL_MS, usedAt: null });
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
    if (!isOpaqueToken(code) || !db || !admin?.auth) return res.status(400).json({ error: 'Invalid OAuth exchange code' });
    const ref = db.collection('oauth_exchange_codes').doc(hashOpaque(code));
    try {
        let record;
        await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            record = snap.data();
            if (!snap.exists) throw new Error('INVALID_EXCHANGE_CODE');
            assertExchangeRecord(record);
            tx.update(ref, { usedAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        const customToken = await admin.auth().createCustomToken(record.uid, { signInProvider: record.provider });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ customToken });
    } catch (_) {
        return res.status(400).json({ error: 'Invalid or expired OAuth exchange code' });
    }
});


/**
 * GET /api/auth/linkedin/test-credentials — Verify LinkedIn credentials are configured
 * Called by Admin OAuth panel to show live status badge.
 */
app.get('/api/auth/linkedin/test-credentials', async (req, res) => {
    const { clientId, clientSecret } = await getSocialAuthCredentials('linkedin', req.app.get('db'));
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
    const { clientId, clientSecret } = await getSocialAuthCredentials('github', req.app.get('db'));
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


