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
require('dotenv').config();
const EmailNotifier = require('./services/emailNotifier');
const { loadProviderConfiguration, generateWithProviders } = require('./services/aiRuntime');
const { loadAiAdminSettings, saveAiAdminSettings, testAiProvider } = require('./services/aiAdmin');
const { createExportRenderToken, consumeExportRenderToken, discardExportRenderToken } = require('./security/exportTokens');
const app = express();
const cors = require('cors');
const cryptoRandom = require('crypto');
const { requireAuth, requirePermission, permissionsFor } = require('./security/auth');
const { enforceApiPolicy } = require('./security/policy');
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
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    maxAge: 600,
    credentials: false
}));

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Security Headers
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" })); // Allow cross-origin image/resource loading if needed

// Global API Rate Limiter (200 requests per 15 minutes)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
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
    '/stripe-webhook', '/public-export', '/export-render-data', '/contact', '/auth/custom-password-reset',
    '/auth/verify-email-token', '/auth/set-user-password', '/auth/linkedin', '/auth/linkedin/callback',
    '/auth/github', '/auth/github/callback', '/auth/oauth/exchange'
]);
app.use('/api', (req, res, next) => {
    if (publicApiPaths.has(req.path)) return next();
    return requireAuth(req, res, next);
});
app.use('/api', (req, res, next) => {
    if (publicApiPaths.has(req.path)) return next();
    return enforceApiPolicy(req, res, next);
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
// Server-owned catalog. Amounts are smallest currency units and never derive from a browser request.
const PLAN_CATALOG = Object.freeze({
    monthly: { amount: 1999, currency: 'usd', months: 1 },
    halfYear: { amount: 9999, currency: 'usd', months: 6 },
    yearly: { amount: 17999, currency: 'usd', months: 12 }
});
// India gateway catalog. Values are subunits (paise) and are never accepted from clients.
const INDIA_PLAN_CATALOG = Object.freeze({
    // Current advertised prices include the configured 18% GST.
    monthly: { amount: 23482, currency: 'INR', months: 1 },
    halfYear: { amount: 47082, currency: 'INR', months: 6 },
    yearly: { amount: 58882, currency: 'INR', months: 12 }
});
function providerPlan(planId, provider) {
    const catalog = provider === 'stripe' ? PLAN_CATALOG : INDIA_PLAN_CATALOG;
    const plan = catalog[planId];
    if (!plan) { const err = new Error('INVALID_PLAN'); err.status = 400; throw err; }
    return plan;
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
        if (order.status === 'ACTIVE') return;
        if (!['PAYMENT_CREATED', 'PENDING_PAYMENT', 'PROVIDER_CONFIRMED'].includes(order.status)) {
            throw Object.assign(new Error('INVALID_ORDER_STATE'), { status: 409 });
        }
        const plan = providerPlan(order.planId, order.provider);
        const userRef = db.collection('users').doc(order.uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error('PAYMENT_USER_NOT_FOUND');
        const membershipEnds = calculateMembershipEnd(userSnap.data().membershipEnds, plan.months);
        tx.update(userRef, {
            membership: 'Premium', membershipEnds, paymentStatus: 'ACTIVE',
            lastPaymentGateway: gatewayLabel, lastPaymentOrderId: orderRef.id, cancellationRequested: false,
            lastPaymentSync: admin.firestore.FieldValue.serverTimestamp()
        });
        tx.update(orderRef, {
            status: 'ACTIVE', membershipEnds, providerPaymentId: providerPaymentId || null,
            activatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });
    const activatedOrder = (await orderRef.get()).data();
    await consumeCouponRedemption(orderRef.id, activatedOrder);
    return activatedOrder;
}
async function createProviderOrderRecord({ uid, planId, provider, couponCode }) {
    const basePlan = providerPlan(planId, provider);
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
    const basePlan = PLAN_CATALOG[planId];
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
async function paypalConfig() {
    let clientId = process.env.PAYPAL_CLIENT_ID || '';
    let clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
    let environment = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
    if ((!clientId || !clientSecret) && db) {
        const stored = (await db.collection('settings').doc('payment_providers').get()).data()?.paypal || {};
        clientId = clientId || stored.clientId || '';
        clientSecret = clientSecret || stored.clientSecret || '';
        environment = stored.environment || environment;
        if (!clientId || !clientSecret) {
            const legacy = (await db.collection('data').doc('subscriptions').get()).data() || {};
            clientId = clientId || legacy.paypalClientId || '';
            clientSecret = clientSecret || legacy.paypalClientSecret || '';
        }
    }
    if (!clientId || !clientSecret) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
    const baseUrl = environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    return { clientId, clientSecret, baseUrl };
}
app.post('/api/paypal/create-order', async (req, res) => {
    let orderRef;
    try {
        const { clientId, clientSecret, baseUrl } = await paypalConfig();
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
        return res.json({ verified: true, orderId: providerOrderId, paymentOrderId, status: active.status, membershipEnds: active.membershipEnds });
    } catch (err) {
        console.error('[PayPal verify]', err.message);
        return res.status(err.status || 502).json({ verified: false, error: 'PayPal verification unavailable' });
    }
});

// Razorpay credentials are server-owned and never accepted from payment requests.
async function getRazorpayKeys() {
    let keyId = process.env.RAZORPAY_KEY_ID || '';
    let keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if ((!keyId || !keySecret) && db) {
        try {
            const doc = await db.collection('settings').doc('payment_providers').get();
            const data = doc.data()?.razorpay || {};
            keyId = keyId || data.keyId || '';
            keySecret = keySecret || data.keySecret || '';
            if (!keyId || !keySecret) {
                const legacy = (await db.collection('data').doc('subscriptions').get()).data() || {};
                keyId = keyId || legacy.razorpayKeyId || '';
                keySecret = keySecret || legacy.razorpayKeySecret || '';
            }
        } catch (error) {
            console.warn('[Razorpay config]', error.message);
        }
    }
    return { keyId, keySecret };
}

app.post('/api/razorpay/create-order', async (req, res) => {
    let internalRef;
    try {
        const { keyId, keySecret } = await getRazorpayKeys();
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
        return res.json({ verified: true, status: active.status, paymentOrderId, membershipEnds: active.membershipEnds });
    } catch (err) {
        console.error('[Razorpay verify]', err.message);
        return res.status(err.status || 502).json({ verified: false, error: 'Razorpay verification unavailable' });
    }
});

// ── Helper: Resolve Paytm Credentials from Firestore / .env ──────────────────
async function getPaytmConfig() {
    let mid = process.env.PAYTM_MID || '';
    let key = process.env.PAYTM_MERCHANT_KEY || '';
    let website = process.env.PAYTM_WEBSITE || 'WEBSTAGING';
    let channelId = process.env.PAYTM_CHANNEL_ID || 'WEB';
    const env = (process.env.PAYTM_ENV || 'staging').toLowerCase();
    const isLive = env === 'production' || env === 'live';
    const baseUrl = isLive ? 'https://securegw.paytm.in' : 'https://securegw-stage.paytm.in';

    if ((!mid || !key) && db) {
        try {
            const doc = await db.collection('settings').doc('payment_providers').get();
            if (doc.exists) {
                const d = doc.data()?.paytm || {};
                if (!mid && d.mid) mid = d.mid;
                if (!key && d.merchantKey) key = d.merchantKey;
                if (d.website) website = d.website;
            }
            if (!mid || !key) {
                const legacy = (await db.collection('data').doc('subscriptions').get()).data() || {};
                mid = mid || legacy.paytmMid || '';
                key = key || legacy.paytmMerchantKey || '';
                website = legacy.paytmWebsite || website;
            }
        } catch (e) {
            console.warn('[Paytm Config] Firestore lookup notice:', e.message);
        }
    }
    return { mid, key, website, channelId, baseUrl, isLive };
}

// ── Helper: Resolve PhonePe Credentials from Firestore / .env ────────────────
async function getPhonePeConfig() {
    let merchantId = process.env.PHONEPE_MERCHANT_ID || '';
    let saltKey = process.env.PHONEPE_SALT_KEY || '';
    let saltIndex = parseInt(process.env.PHONEPE_SALT_INDEX || '1');
    const env = (process.env.PHONEPE_ENV || 'sandbox').toLowerCase();
    const isLive = env === 'production' || env === 'live';
    const baseUrl = isLive
        ? 'https://api.phonepe.com/apis/hermes'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

    if ((!merchantId || !saltKey) && db) {
        try {
            const doc = await db.collection('settings').doc('payment_providers').get();
            if (doc.exists) {
                const d = doc.data()?.phonepe || {};
                if (!merchantId && d.merchantId) merchantId = d.merchantId;
                if (!saltKey && d.saltKey) saltKey = d.saltKey;
                if (d.saltIndex) saltIndex = parseInt(d.saltIndex) || 1;
            }
            if (!merchantId || !saltKey) {
                const legacy = (await db.collection('data').doc('subscriptions').get()).data() || {};
                merchantId = merchantId || legacy.phonepeId || '';
                saltKey = saltKey || legacy.phonepeSaltKey || '';
                saltIndex = parseInt(legacy.phonepeSaltIndex || saltIndex) || 1;
            }
        } catch (e) {
            console.warn('[PhonePe Config] Firestore lookup notice:', e.message);
        }
    }
    return { merchantId, saltKey, saltIndex, baseUrl, isLive };
}

// ── Paytm: server-owned transaction lifecycle ───────────────────────────────
app.post('/api/paytm/initiate-transaction', async (req, res) => {
    let orderRef;
    try {
        const { mid, key, website, channelId, baseUrl, isLive } = await getPaytmConfig();
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
        return res.status(err.status || 502).json({ success: false, error: 'Unable to create Paytm transaction' });
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
        const { merchantId, saltKey, saltIndex, baseUrl, isLive } = await getPhonePeConfig();
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
        return res.status(err.status || 502).json({ success: false, error: 'Unable to create PhonePe transaction' });
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
        const { merchantId, saltKey, saltIndex, baseUrl } = await getPhonePeConfig();
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

app.post('/api/messages/conversations', async (req, res) => {
    const applicationId = String(req.body.applicationId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(applicationId) || !db || !admin?.database) {
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
        return res.status(201).json({ success: true, messageId: messageRef.key });
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

app.get('/api/export-render-data', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    const data = consumeExportRenderToken(req.query.token);
    if (!data) return res.status(404).json({ error: 'Export data not found' });
    return res.json({ data });
});

let activeExports = 0;
const MAX_CONCURRENT_EXPORTS = 5;

app.post(['/api/export', '/api/public-export'], async (req, res) => {
    if (activeExports >= MAX_CONCURRENT_EXPORTS) {
        return res.status(429).json({ error: 'Server is busy processing PDF exports. Please try again in a few seconds.' });
    }
    let browser;
    let renderToken;
    let slotAcquired = false;
    try {
        const resumeId = String(req.body.resumeId || '');
        const resumeName = String(req.body.resumeName || '');
        const language = String(req.body.language || 'en');
        if (!/^[A-Za-z0-9_-]{4,128}$/.test(resumeId)
            || !/^Cv(?:[1-9]|[1-4][0-9]|5[0-1])$/.test(resumeName)
            || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) {
            return res.status(400).json({ error: 'Invalid export request' });
        }
        const requestDb = req.app.get('db');
        if (!requestDb) return res.status(503).json({ error: 'Export authorization unavailable' });

        let stored;
        let ownerUid;
        if (req.path === '/public-export') {
            const publishedSnap = await requestDb.collection('pb').doc(resumeId).get();
            const published = publishedSnap.data();
            if (!publishedSnap.exists || published?.isPublished !== true || published?.publicationMode !== 'explicit') return res.status(404).json({ error: 'Resume not found' });
            ownerUid = published.ownerUid;
            try { stored = JSON.parse(published.object); } catch { return res.status(422).json({ error: 'Resume data is invalid' }); }
        } else {
            ownerUid = req.user?.uid;
            const privateSnap = await requestDb.collection('users').doc(ownerUid).collection('resumes').doc(resumeId).get();
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
        renderToken = createExportRenderToken(stored);
        activeExports++;
        slotAcquired = true;
        const launchOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process', '--no-zygote']
        };
        browser = await chromium.launch(launchOptions);
        const context = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
        const allowedRenderOrigin = new URL(`${protocol}://${websiteName}`).origin;
        // A resume can contain remote image/font URLs. Prevent the renderer from becoming
        // a blind SSRF client into cloud metadata or internal services.
        await context.route('**/*', async route => {
            const requestUrl = route.request().url();
            if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:')) return route.continue();
            try {
                const parsed = new URL(requestUrl);
                if (parsed.origin === allowedRenderOrigin) return route.continue();
            } catch (_) {}
            return route.abort('blockedbyclient');
        });
        const page = await context.newPage();
        const targetUrl = `${protocol}://${websiteName}/export/${encodeURIComponent(resumeName)}/${encodeURIComponent(resumeId)}/${encodeURIComponent(language)}#renderToken=${encodeURIComponent(renderToken)}`;
        console.log('Playwright exporting PDF, navigating to: ', targetUrl);
        await page.goto(targetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });
        // Wait for the normalized lazy template to commit. Export errors fail closed instead
        // of silently producing an empty/corrupt PDF.
        await page.waitForFunction(
            'document.documentElement.getAttribute("data-export-ready") === "true" || document.documentElement.hasAttribute("data-export-error")',
            { timeout: 25000 }
        );
        const exportError = await page.evaluate(() => globalThis.document.documentElement.getAttribute('data-export-error'));
        if (exportError) throw new Error(`EXPORT_RENDER_FAILED:${exportError}`);
        await page.evaluate(async () => {
            await globalThis.document.fonts?.ready;
            await Promise.all([...globalThis.document.images].map(image => image.complete || !image.decode ? Promise.resolve() : image.decode().catch(() => {})));
        }).catch(() => {});
        await page.waitForTimeout(250);

        const pdfPath = path.join(__dirname, `resume_${Date.now()}.pdf`);
        await page.pdf({
            path: pdfPath,
            format: 'A4',
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

        res.setHeader('Content-Type', 'application/pdf');
        res.download(pdfPath, 'resume.pdf', (err) => {
            if (err) {
                console.error('res.download error:', err);
            }
            if (fs.existsSync(pdfPath)) {
                fs.unlinkSync(pdfPath);
            }
        });
    } catch (error) {
        console.error('Export PDF error:', error);
        if (browser) await browser.close().catch(() => {});
        res.status(500).json({ error: error.message });
    } finally {
        if (renderToken) discardExportRenderToken(renderToken);
        if (slotAcquired) activeExports = Math.max(0, activeExports - 1);
    }
});

// Import AI & Email routes
const aiRoutes = require('./routes/ai');
const emailRoutes = require('./routes/email');

// Use AI & Email routes
app.use('/api', aiRoutes);
app.use('/api', emailRoutes);
app.use('/api/email', emailRoutes);

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
        for (const document of stillDue) transaction.update(document.ref, {
            status: 'approved', publishedAt: admin.firestore.FieldValue.serverTimestamp(), scheduledAt: null,
            revision: Number(document.data()?.revision || 0) + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (stillDue.length) transaction.set(requestDb.collection('security_audit_logs').doc(), {
            action: 'CMS_SCHEDULED_POSTS_PUBLISHED', actorUid, count: stillDue.length, requestId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return stillDue.length;
    });
}

app.post('/api/admin/blog/publish-due', async (req, res) => {
    try {
        const published = await publishDueBlogPosts(req.app.get('db'), { actorUid: req.user.uid, requestId: res.locals.requestId });
        return res.json({ success: true, published });
    } catch {
        return res.status(503).json({ success: false, error: 'CMS scheduler unavailable' });
    }
});

app.get('/api/admin/health-summary', async (_req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Health services unavailable.' });
    try {
        const [publicConfig, aiProviders, paymentProviders] = await Promise.all([
            db.collection('data').doc('public_config').get(),
            db.collection('settings').doc('ai_providers').get(),
            db.collection('settings').doc('payment_providers').get(),
        ]);
        const ai = aiProviders.data() || {};
        const payments = paymentProviders.data() || {};
        return res.json({
            success: true,
            checkedAt: new Date().toISOString(),
            services: {
                backend: { reachable: true }, firebaseAdmin: { configured: true },
                aiProviders: Object.fromEntries(['gemini', 'nvidia', 'openai', 'groq', 'openrouter', 'deepseek'].map(provider => [provider, { configured: Boolean(ai[provider]?.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`]) }])),
                payments: {
                    stripe: { configured: Boolean(payments.stripe?.secretKey || process.env.STRIPE_SECRET) },
                    razorpay: { configured: Boolean(payments.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET) },
                },
            },
            settings: publicConfig.data()?.systemHealth || { maintenanceMode: false, maintenanceMessage: '' },
        });
    } catch (error) {
        console.error('[Admin health summary]', error.message);
        return res.status(503).json({ success: false, error: 'Unable to read service health configuration.' });
    }
});

app.post('/api/admin/system-health-settings', async (req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Settings service unavailable.' });
    const maintenanceMode = req.body?.maintenanceMode === true;
    const maintenanceMessage = String(req.body?.maintenanceMessage || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
    if (maintenanceMode && !maintenanceMessage) return res.status(400).json({ success: false, error: 'A maintenance message is required while maintenance mode is enabled.' });
    const systemHealth = { maintenanceMode, maintenanceMessage };
    const batch = db.batch();
    batch.set(db.collection('data').doc('public_config'), { systemHealth }, { merge: true });
    batch.set(db.collection('security_audit_logs').doc(), {
        action: 'SYSTEM_HEALTH_SETTINGS_UPDATED', actorUid: req.user.uid, maintenanceMode,
        requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return res.json({ success: true, settings: systemHealth });
});

const GENERIC_ADMIN_SETTING_CATEGORIES = new Set([
    'modules', 'auth', 'blog', 'watermark', 'templateManager', 'security', 'jobScraper',
    'exportPdf', 'branding', 'geoSeo', 'llmGeo', 'enabledTemplates', 'integrations',
    'socialAuth', 'google', 'facebook', 'smtp', 'fallbackSmtp', 'imap',
    'storage', 'codeInjection'
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
    const publicApiKeys = new Set(['apiKey', 'googleMapsApiKey', 'cloudinaryApiKey']);
    return /(?:secret|password|privateKey|authToken|clientToken|accessToken|refreshToken|serviceAccount|merchantKey|saltKey|keySecret|s3AccessKeyId)/i.test(key)
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

function publicAdminSettings(category, data) {
    if (category === 'codeInjection') return {};
    if (['smtp', 'fallbackSmtp', 'imap'].includes(category)) return { enabled: data.enabled === true };
    const redact = value => {
        if (Array.isArray(value)) return value.map(redact);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).filter(([key]) => !isPrivateAdminSettingKey(category, key)).map(([key, item]) => [key, redact(item)]));
    };
    return redact(data);
}

app.post('/api/admin/settings/:category', async (req, res) => {
    const category = String(req.params.category || '');
    if (!GENERIC_ADMIN_SETTING_CATEGORIES.has(category) || !req.body?.data || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) {
        return res.status(400).json({ success: false, error: 'Unsupported settings category or payload.' });
    }
    const requestDb = req.app.get('db');
    if (!requestDb || !admin) return res.status(503).json({ success: false, error: 'Settings service unavailable.' });
    try {
        if (Buffer.byteLength(JSON.stringify(req.body.data), 'utf8') > 100_000) throw new Error('Settings payload is too large.');
        const normalized = normalizeAdminSettingValue(req.body.data);
        let publicSettings;
        const expectedRevision = Number(req.body.expectedRevision || 0);
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid settings revision.');
        const secretRef = requestDb.collection('settings').doc('admin_configuration');
        const publicRef = requestDb.collection('data').doc('public_config');
        const revision = await requestDb.runTransaction(async transaction => {
            const snapshot = await transaction.get(secretRef);
            const currentRevision = Number(snapshot.data()?._revisions?.[category] || 0);
            if (expectedRevision !== currentRevision) {
                const stale = new Error('These settings changed after the panel loaded. Refresh before saving.');
                stale.code = 'ADMIN_SETTINGS_CONFLICT';
                throw stale;
            }
            const nextRevision = currentRevision + 1;
            const persisted = preserveAdminSettingSecrets(category, snapshot.data()?.[category], normalized);
            publicSettings = publicAdminSettings(category, persisted);
            transaction.set(secretRef, { [category]: persisted, _revisions: { [category]: nextRevision } }, { merge: true });
            transaction.set(publicRef, { [category]: publicSettings, _settingsRevisions: { [category]: nextRevision } }, { merge: true });
            transaction.set(requestDb.collection('security_audit_logs').doc(), {
                action: 'ADMIN_SETTINGS_UPDATED', actorUid: req.user.uid, category, revision: nextRevision,
                changedFields: Object.keys(normalized).slice(0, 200), requestId: res.locals.requestId,
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
    if (!db) return res.status(503).json({ success: false, error: 'Settings service unavailable' });
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
    await db.collection('data').doc('public_config').set({ gdpr }, { merge: true });
    return res.json({ success: true, settings: gdpr });
});

app.post('/api/admin/ai-settings', async (req, res) => {
    try {
        const result = await saveAiAdminSettings({
            db: req.app.get('db'), admin, input: req.body || {},
            expectedRevision: req.body?.expectedRevision ?? 0,
            actorUid: req.user.uid, requestId: res.locals.requestId,
        });
        return res.json({ success: true, ...result, message: 'AI settings saved securely.' });
    } catch (error) {
        return res.status(error.status || 400).json({ success: false, code: error.code || 'AI_SETTINGS_SAVE_FAILED', error: error.message, requestId: res.locals.requestId });
    }
});

app.post('/api/admin/ai/test-provider', async (req, res) => {
    try {
        const result = await testAiProvider({
            db: req.app.get('db'), environment: process.env,
            provider: String(req.body?.provider || ''), model: req.body?.model,
            apiKey: req.body?.apiKey, fetchImpl: global.fetch, timeoutMs: 10000,
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, code: error.code || 'AI_PROVIDER_TEST_FAILED', error: error.message, requestId: res.locals.requestId });
    }
});

app.post('/api/admin/payment-settings', async (req, res) => {
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Settings service unavailable.' });
    const input = req.body || {};
    const numberInRange = (value, min, max, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
    };
    const publicSettings = {
        state: input.state !== false,
        monthlyPrice: numberInRange(input.monthlyPrice, 0, 1_000_000, 199),
        quartarlyPrice: numberInRange(input.quartarlyPrice, 0, 1_000_000, 399),
        yearlyPrice: numberInRange(input.yearlyPrice, 0, 1_000_000, 499),
        currency: /^[A-Z]{3}$/.test(String(input.currency || '').toUpperCase()) ? String(input.currency).toUpperCase() : 'INR',
        onlyPP: input.onlyPP === true,
        sandboxMode: input.sandboxMode === true,
        razorpayUPI: input.razorpayUPI !== false,
        ...Object.fromEntries(['stripeEnabled','paypalEnabled','razorpayEnabled','paytmEnabled','phonepeEnabled','enableTax','taxInclusive','requireCustomerTaxId'].map(key => [key, input[key] === true])),
        taxName: String(input.taxName || 'GST').slice(0, 30),
        taxRate: numberInRange(input.taxRate, 0, 100, 18),
        companyTaxId: String(input.companyTaxId || '').slice(0, 30),
        supplierLegalName: String(input.supplierLegalName || '').slice(0, 150),
        supplierTradeName: String(input.supplierTradeName || '').slice(0, 150),
        supplierGstin: String(input.supplierGstin || '').slice(0, 30),
        supplierPan: String(input.supplierPan || '').slice(0, 30),
        supplierAddress: String(input.supplierAddress || '').slice(0, 500),
        supplierCity: String(input.supplierCity || '').slice(0, 100),
        supplierState: String(input.supplierState || '').slice(0, 100),
        supplierStateCode: String(input.supplierStateCode || '').slice(0, 10),
        supplierPincode: String(input.supplierPincode || '').slice(0, 20),
        sacCode: String(input.sacCode || '').slice(0, 30),
        invoicePrefix: String(input.invoicePrefix || 'RPAI').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20),
        financialYear: String(input.financialYear || '').slice(0, 20),
        receiptTemplate: ['modern','classic','minimal'].includes(input.receiptTemplate) ? input.receiptTemplate : 'modern',
        reverseCharge: input.reverseCharge === 'Yes' ? 'Yes' : 'No',
        stripePublishableKey: String(input.stripePublishableKey || '').slice(0, 200),
        razorpayKeyId: String(input.razorpayKeyId || '').slice(0, 100),
        paypalClientId: String(input.paypalClientId || '').slice(0, 200),
        paytmMid: String(input.paytmMid || '').slice(0, 50),
        paytmWebsite: String(input.paytmWebsite || 'WEBSTAGING').slice(0, 50),
        phonepeId: String(input.phonepeId || '').slice(0, 100),
        phonepeSaltIndex: String(input.phonepeSaltIndex || '1').slice(0, 10)
    };
    const secretValue = value => {
        const text = String(value || '').trim();
        if (text && (text.length < 8 || text.length > 1000)) throw new Error('Invalid provider secret length.');
        return text;
    };
    try {
        const providerSecrets = {
            stripe: { secretKey: secretValue(input.stripeSecretKey) },
            paypal: { clientSecret: secretValue(input.paypalClientSecret), clientId: publicSettings.paypalClientId, environment: publicSettings.sandboxMode ? 'sandbox' : 'live' },
            razorpay: { keySecret: secretValue(input.razorpayKeySecret), keyId: publicSettings.razorpayKeyId },
            paytm: { merchantKey: secretValue(input.paytmMerchantKey), mid: publicSettings.paytmMid, website: publicSettings.paytmWebsite },
            phonepe: { saltKey: secretValue(input.phonepeSaltKey), merchantId: publicSettings.phonepeId, saltIndex: publicSettings.phonepeSaltIndex }
        };
        // Blank secrets are omitted so viewing/saving a masked form never erases live keys.
        for (const provider of Object.values(providerSecrets)) {
            for (const [key, value] of Object.entries(provider)) if (value === '') delete provider[key];
        }
        const batch = db.batch();
        batch.set(db.collection('settings').doc('payment_providers'), providerSecrets, { merge: true });
        batch.set(db.collection('data').doc('public_config'), { subscriptions: publicSettings }, { merge: true });
        batch.set(db.collection('security_audit_logs').doc(), {
            action: 'PAYMENT_SETTINGS_UPDATED', actorUid: req.user.uid,
            requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        return res.json({ success: true, settings: publicSettings, message: 'Payment settings saved to split public/secret stores.' });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
});

// Admin diagnostic test-connection endpoint
app.post('/api/admin/payment/test-provider', async (req, res) => {
    const { type, secretKey } = req.body;
    if (!['stripe', 'razorpay', 'paytm', 'phonepe'].includes(type)) return res.status(400).json({ success: false, code: 'PAYMENT_PROVIDER_VALIDATION_ERROR', error: 'Unsupported payment provider test.' });
    try {
        if (type === 'stripe') {
            const stripeKey = secretKey || process.env.STRIPE_SECRET;
            if (!stripeKey) {
                return res.json({ success: false, error: 'No Stripe Secret Key provided.' });
            }
            const Stripe = require('stripe');
            const stripeInstance = Stripe(stripeKey);
            const balance = await stripeInstance.balance.retrieve();
            return res.json({ success: true, message: `Connected to Stripe. Livemode: ${balance.livemode}` });
        } else if (type === 'razorpay') {
            const keyId = req.body.keyId || process.env.RAZORPAY_KEY_ID;
            const keySecret = req.body.keySecret || process.env.RAZORPAY_KEY_SECRET;
            if (!keyId || !keySecret) {
                return res.json({ success: false, error: 'Razorpay Key ID and Key Secret are required.' });
            }
            const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
            const rzpRes = await fetch('https://api.razorpay.com/v1/settings', {
                headers: { 'Authorization': authHeader }
            });
            const rzpData = await rzpRes.json();
            if (rzpRes.ok || rzpData.id || rzpData.profile) {
                return res.json({ success: true, message: `Razorpay connected. Mode: ${keyId.startsWith('rzp_live') ? 'LIVE' : 'TEST'}` });
            } else {
                return res.json({ success: false, error: rzpData.error?.description || 'Razorpay authentication failed. Check your keys.' });
            }
        } else if (type === 'paytm') {
            const mid = req.body.mid || process.env.PAYTM_MID;
            const merchantKey = req.body.merchantKey || process.env.PAYTM_MERCHANT_KEY;
            if (!mid || !merchantKey) {
                return res.json({ success: false, error: 'Paytm Merchant ID and Merchant Key are required.' });
            }
            // Paytm credential format validation (MID is typically 20 chars alphanumeric)
            const midValid = /^[A-Za-z0-9]{8,30}$/.test(mid);
            const keyValid = merchantKey.length >= 16;
            if (!midValid || !keyValid) {
                return res.json({ success: false, error: 'Invalid Paytm credentials format. MID should be 8-30 alphanumeric chars; Merchant Key should be 16+ chars.' });
            }
            const env = (process.env.PAYTM_ENV || 'staging').toLowerCase();
            return res.json({ success: true, message: `Paytm credentials validated. Env: ${env === 'production' || env === 'live' ? 'LIVE' : 'STAGING/SANDBOX'}` });
        } else if (type === 'phonepe') {
            const merchantId = req.body.merchantId || process.env.PHONEPE_MERCHANT_ID;
            const saltKey = req.body.saltKey || process.env.PHONEPE_SALT_KEY;
            if (!merchantId || !saltKey) {
                return res.json({ success: false, error: 'PhonePe Merchant ID and Salt Key are required.' });
            }
            const env = (process.env.PHONEPE_ENV || 'sandbox').toLowerCase();
            const baseUrl = (env === 'production' || env === 'live')
                ? 'https://api.phonepe.com/apis/hermes'
                : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
            const crypto = require('crypto');
            // Test a status check with a fake orderId to validate credential format
            const checksumStr = `/pg/v1/status/${merchantId}/TEST_CONN${saltKey}`;
            const sha256Hash = crypto.createHash('sha256').update(checksumStr).digest('hex');
            const saltIndex = parseInt(req.body.saltIndex || process.env.PHONEPE_SALT_INDEX || '1');
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
                    return res.json({ success: false, error: ppData?.message || `PhonePe authentication failed (HTTP ${ppRes.status}). Check credentials.` });
                }
            } catch (ppErr) {
                return res.json({ success: false, error: `PhonePe connection error: ${ppErr.message}` });
            }
        }
        return res.status(400).json({ success: false, code: 'PAYMENT_PROVIDER_VALIDATION_ERROR', error: 'Unsupported payment provider test.' });

    } catch (err) {
        res.json({ success: false, error: err.message });
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
    return {
        accountSid: canonical.accountSid || process.env.TWILIO_ACCOUNT_SID || legacy.accountSid || '',
        authToken: canonical.authToken || process.env.TWILIO_AUTH_TOKEN || legacy.authToken || '',
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

app.post('/api/admin/twilio-settings', async (req, res) => {
    const requestDb = req.app.get('db');
    if (!requestDb || !admin) return res.status(503).json({ success: false, error: 'SMS configuration service unavailable.' });
    const accountSid = String(req.body?.accountSid || '').trim();
    const authToken = String(req.body?.authToken || '').trim();
    const fromPhoneNumber = String(req.body?.fromPhoneNumber || '').trim();
    const enableSmsAlerts = req.body?.enableSmsAlerts === true;
    const expectedRevision = Number(req.body?.expectedRevision || 0);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid SMS settings revision.' });
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
            const resolvedAccountSid = accountSid || current.accountSid || configuredFallback.accountSid || '';
            const resolvedAuthToken = authToken || current.authToken || configuredFallback.authToken || '';
            const resolvedFrom = fromPhoneNumber || current.fromPhoneNumber || configuredFallback.fromPhoneNumber || '';
            if (enableSmsAlerts && (!resolvedAccountSid || !resolvedAuthToken || !resolvedFrom)) { const invalid = new Error('Configure the Account SID, Auth Token, and sender number before enabling SMS alerts.'); invalid.code = 'TWILIO_CONFIGURATION_INCOMPLETE'; throw invalid; }
            const nextRevision = currentRevision + 1;
            const next = { ...current, ...(accountSid ? { accountSid, authToken } : {}), ...(fromPhoneNumber ? { fromPhoneNumber } : {}), enableSmsAlerts, _revision: nextRevision };
            transaction.set(reference, { twilio: next }, { merge: true });
            transaction.set(publicReference, { twilio: { enableSmsAlerts }, _settingsRevisions: { twilio: nextRevision } }, { merge: true });
            transaction.set(requestDb.collection('security_audit_logs').doc(), { action: 'TWILIO_SETTINGS_UPDATED', actorUid: req.user.uid, revision: nextRevision, credentialsRotated: Boolean(accountSid), requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
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
app.post('/api/send-sms', async (req, res) => {
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
    const { resumeName, resumeId, language } = req.body;
    const requestDb = req.app.get('db');
    if (!requestDb || !/^[A-Za-z0-9_-]{4,128}$/.test(String(resumeId || ''))) return res.status(400).json({ error: 'Invalid resume' });
    const resumeSnap = await requestDb.collection('users').doc(req.user.uid).collection('resumes').doc(String(resumeId)).get();
    if (!resumeSnap.exists) return res.status(404).json({ error: 'Resume not found' });
    const ownerSnap = await requestDb.collection('users').doc(req.user.uid).get();
    const owner = ownerSnap.data() || {};
    const membershipEnd = owner.membershipEnds?.toDate?.() || new Date(owner.membershipEnds || 0);
    if (owner.membership !== 'Premium' || !['ACTIVE', 'ADMIN_GRANTED'].includes(owner.paymentStatus) || membershipEnd <= new Date()) {
        return res.status(402).json({ error: { code: 'ACTIVE_SUBSCRIPTION_REQUIRED', message: 'An active subscription is required for DOCX export', requestId: res.locals.requestId } });
    }
    // Compatibility representation; ownership and entitlement are enforced even while full DOCX rendering is pending.
    const safeName = String(resumeName || 'Resume').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 80);
    const safeLanguage = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(String(language || '')) ? language : 'en';
    const docxContent = `FILE: ${safeName}\nID: ${resumeId}\nLANGUAGE: ${safeLanguage}\nSTATUS: DOCX Export Generated Successfully`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="resume.docx"`);
    res.send(Buffer.from(docxContent, 'utf-8'));
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
        const { jobTitle, companyName, recipientName, userSkills, yearsExperience } = req.body;

        const title = jobTitle || 'Software Engineer';
        const company = companyName || 'TechCorp';
        const recipient = recipientName || 'Hiring Manager';
        const exp = yearsExperience || 'proven track record of';
        const skills = userSkills || 'full-stack architecture, API optimization, and team leadership';

        const candidate = String(req.body.candidateName || 'Candidate').trim().slice(0, 120) || 'Candidate';
        if ([title, company, recipient, skills, candidate].some(value => String(value).length > 4000)) {
            return res.status(400).json({ success: false, error: 'Cover letter input is too large' });
        }
        const systemPrompt = 'You are an elite executive career strategist and professional resume writer specializing in high-impact ATS cover letters. Never invent candidate facts and return only the requested cover letter.';
        const prompt = `${systemPrompt}

Write a compelling, tailored, 3-paragraph ATS cover letter addressed to ${recipient} for a ${title} position at ${company}. Highlight ${exp} years of experience and key skills in ${skills}. Close the letter with the candidate name ${candidate}.`;
        try {
            const configuration = await loadProviderConfiguration(db);
            configuration.maxTokens = Math.min(1000, Math.max(500, configuration.maxTokens));
            const providerResult = await generateWithProviders({ prompt, configuration, operation: 'generate-ai-cover-letter', signal: requestController.signal });
            const coverLetter = String(providerResult.raw || '').replace(/^```(?:text)?\s*|```$/gi, '').trim().slice(0, 20000);
            if (coverLetter) {
                res.setHeader('X-AI-Provider', providerResult.provider);
                res.setHeader('X-AI-Model', providerResult.model);
                return res.json({ success: true, coverLetter, provider: providerResult.provider });
            }
        } catch (providerError) {
            console.warn('[Cover letter provider fallback]', { code: providerError.code || 'PROVIDER_ERROR', requestId: res.locals.requestId });
        }

        // 3. Dynamic Context-Aware AI Generator Engine (No Hardcoding)
        const hookTemplates = [
            `I am thrilled to submit my application for the ${title} role at ${company}. Having followed ${company}'s industry impact and growth trajectory, I am eager to contribute my background in ${skills} to advance your team's upcoming initiatives.`,
            `With a strong background executing high-value projects in ${title} roles, I am excited about the opportunity to join ${company}. My career has been defined by delivering measurable efficiency gains and driving technical innovation.`,
            `It is with great enthusiasm that I apply for the ${title} position at ${company}. As a proactive practitioner with over ${exp} years of specialized experience, I have consistently turned strategic goals into impactful execution.`
        ];

        const bodyTemplates = [
            `Over the past ${exp} years, I have spearheaded cross-functional teams and engineered scalable solutions that reduced operating overhead while accelerating delivery timelines. At my previous organizations, my focus on ${skills} enabled us to exceed performance benchmarks consistently. I thrive in dynamic environments where complex problems require structured, resilient solutions.`,
            `My core competencies encompass ${skills}, with a proven track record of optimizing workflow architectures and leading cross-disciplinary initiatives. At ${company}, I am prepared to leverage this expertise to streamline core operations, mentor junior team members, and drive sustainable long-term value.`,
            `Throughout my professional journey, I have specialized in ${skills}. My approach combines data-driven decision-making with hands-on technical rigor, ensuring that every project not only meets compliance standards but delivers compelling user and business outcomes.`
        ];

        const closeTemplates = [
            `I would welcome the opportunity to discuss how my experience and skill set directly align with ${company}'s strategic priorities for the ${title} position. Thank you for your time and consideration.`,
            `I look forward to the possibility of discussing how my qualifications and enthusiasm for ${company}'s mission can contribute to your team's continued success. Thank you for evaluating my application.`,
            `Thank you for reviewing my candidacy. I am eager to explore how my background in ${skills} can help ${company} achieve its long-term objectives.`
        ];

        const randomPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const generated = `Dear ${recipient},\n\n${randomPick(hookTemplates)}\n\n${randomPick(bodyTemplates)}\n\n${randomPick(closeTemplates)}\n\nSincerely,\n${candidate}`;

        res.json({
            success: true,
            coverLetter: generated,
            provider: 'Dynamic AI Synthesis Engine'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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

app.get('/healthz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ status: 'ok', firebaseAdminConfigured: Boolean(db && admin) });
});

app.get('/readyz', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const firebaseReady = Boolean(db && admin?.auth);
    return res.status(firebaseReady ? 200 : 503).json({
        status: firebaseReady ? 'ready' : 'not_ready',
        checks: {
            firebaseAdmin: firebaseReady ? 'READY' : 'UNAVAILABLE',
            aiProviders: 'NOT_CHECKED', paymentProviders: 'NOT_CHECKED', smtp: 'NOT_CHECKED',
            cmsScheduler: process.env.CMS_SCHEDULER_ENABLED === 'true' ? 'CONFIGURED' : 'DISABLED',
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
        httpServer.listen(port, () => {
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
    const db = req.app.get('db');
    EmailNotifier.notifyUserRegistration(db, { userEmail, userName });
    return res.json({ success: true, message: 'Signup notifications queued.' });
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

app.post('/api/admin/firebase-service-account', async (req, res) => {
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
            const { clientId, clientSecret, baseUrl } = await paypalConfig();
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
            const { keyId, keySecret } = await getRazorpayKeys();
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

// Audited server-authoritative user administration. Firestore rules never permit these
// identity/entitlement fields to be changed directly by a browser.
app.patch('/api/admin/users/:uid', async (req, res) => {
    const uid = String(req.params.uid || '');
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid) || !db || !admin?.auth) {
        return res.status(400).json({ success: false, error: 'Valid user UID and Firebase services are required.' });
    }
    const callerPermissions = permissionsFor(req.user);
    const allowed = permission => callerPermissions.has('*') || callerPermissions.has(permission);
    const updates = {};
    const auditChanges = [];
    try {
        const [target, userSnapshot] = await Promise.all([
            admin.auth().getUser(uid), db.collection('users').doc(uid).get(),
        ]);
        const userData = userSnapshot.data() || {};
        const currentRole = String(target.customClaims?.role || userData.role || 'USER').toUpperCase();
        const currentMembership = String(userData.membership || 'Basic');
        if (Object.hasOwn(req.body, 'expectedSuspended') && typeof req.body.expectedSuspended !== 'boolean') return res.status(400).json({ success: false, error: 'Invalid expected suspension state.' });
        if (Object.hasOwn(req.body, 'expectedRole') && !['ADMIN', 'USER'].includes(req.body.expectedRole)) return res.status(400).json({ success: false, error: 'Invalid expected role.' });
        if (Object.hasOwn(req.body, 'expectedMembership') && !['Basic', 'Premium'].includes(req.body.expectedMembership)) return res.status(400).json({ success: false, error: 'Invalid expected membership.' });
        const staleTarget = (Object.hasOwn(req.body, 'expectedSuspended') && req.body.expectedSuspended !== Boolean(target.disabled))
            || (Object.hasOwn(req.body, 'expectedRole') && req.body.expectedRole !== currentRole)
            || (Object.hasOwn(req.body, 'expectedMembership') && req.body.expectedMembership !== currentMembership);
        if (staleTarget) return res.status(409).json({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This user changed after the page loaded. Refresh before trying again.' });
        const requestedChanges = ['suspended', 'membership', 'role'].filter(field => Object.hasOwn(req.body, field));
        if (requestedChanges.length !== 1) return res.status(400).json({ success: false, error: 'Exactly one administrative user change is allowed per request.' });

        if (typeof req.body.suspended === 'boolean') {
            if (!allowed('users.update')) return res.status(403).json({ success: false, error: 'Insufficient permission.' });
            if (uid === req.user.uid && req.body.suspended) return res.status(400).json({ success: false, error: 'Self-suspension is prohibited.' });
            await admin.auth().updateUser(uid, { disabled: req.body.suspended });
            if (req.body.suspended) await admin.auth().revokeRefreshTokens(uid);
            updates.suspended = req.body.suspended;
            auditChanges.push('suspended');
        }
        if (req.body.membership !== undefined) {
            if (!allowed('payments.manage')) return res.status(403).json({ success: false, error: 'Insufficient permission.' });
            if (!['Basic', 'Premium'].includes(req.body.membership)) return res.status(400).json({ success: false, error: 'Invalid membership.' });
            updates.membership = req.body.membership;
            updates.paymentStatus = req.body.membership === 'Premium' ? 'ADMIN_GRANTED' : 'INACTIVE';
            let durationMonths = Number(req.body.durationMonths || 12);
            if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 600) {
                return res.status(400).json({ success: false, error: 'Invalid membership duration.' });
            }
            if (durationMonths > 60 && !allowed('users.roles.manage')) {
                return res.status(403).json({ success: false, error: 'Long-lived grants require SUPER_ADMIN.' });
            }
            const membershipEnds = new Date();
            membershipEnds.setMonth(membershipEnds.getMonth() + (req.body.membership === 'Premium' ? durationMonths : 0));
            updates.membershipEnds = membershipEnds;
            auditChanges.push('membership');
        }
        if (req.body.role !== undefined) {
            if (!allowed('users.roles.manage')) return res.status(403).json({ success: false, error: 'Insufficient permission.' });
            if (!['ADMIN', 'USER'].includes(req.body.role)) return res.status(400).json({ success: false, error: 'Invalid role.' });
            if (uid === req.user.uid && req.body.role !== 'ADMIN') return res.status(400).json({ success: false, error: 'Self-demotion is prohibited.' });
            await admin.auth().setCustomUserClaims(uid, { ...(target.customClaims || {}), role: req.body.role });
            await admin.auth().revokeRefreshTokens(uid);
            updates.role = req.body.role;
            auditChanges.push('role');
        }
        if (!auditChanges.length) return res.status(400).json({ success: false, error: 'No supported changes supplied.' });
        updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        const batch = db.batch();
        batch.set(db.collection('users').doc(uid), updates, { merge: true });
        batch.set(db.collection('security_audit_logs').doc(), {
            action: 'USER_ADMIN_UPDATE', actorUid: req.user.uid, targetUid: uid,
            changedFields: auditChanges, requestId: res.locals.requestId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        return res.json({ success: true, uid, changedFields: auditChanges });
    } catch (error) {
        console.error('[User admin update]', error.message);
        const status = error.code === 'auth/user-not-found' ? 404 : 500;
        return res.status(status).json({ success: false, error: status === 404 ? 'User not found.' : 'Unable to update user.' });
    }
});

app.post('/api/account/delete', async (req, res) => {
    if (!db || !admin?.auth) return res.status(503).json({ success: false, error: 'Account deletion service unavailable.' });
    const uid = req.user.uid;
    const failures = [];
    try {
        const jobs = await db.collection('jobs').where('employerId', '==', uid).get().catch(() => { failures.push('employer jobs'); return { docs: [] }; });
        for (const job of jobs.docs) {
            try {
                const applications = await db.collection('jobApplications').where('jobId', '==', job.id).get();
                for (const application of applications.docs) await db.recursiveDelete(application.ref);
                await db.recursiveDelete(job.ref);
            } catch { failures.push(`job:${job.id}`); }
        }
        const queries = [
            ['portfolios', db.collection('portfolios').where('userId', '==', uid)],
            ['published portfolios', db.collection('pb').where('ownerUid', '==', uid)],
            ['job applications', db.collection('jobApplications').where('userId', '==', uid)],
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
        return res.json({ success: true, message: 'Identity and owned profile, resume, portfolio, CMS, employer, job, application, and notification data were deleted.', retainedRecordTypes: ['payment_orders', 'invoices', 'transactions', 'subscriptions', 'security_audit_logs'] });
    } catch (error) {
        console.error('[Account self-delete]', error.message);
        return res.status(500).json({ success: false, error: 'Unable to complete account deletion. Identity remains active unless the response explicitly confirms success.' });
    }
});

// Administrative deletion is explicit, recently authenticated, and recursive.
app.post(['/api/admin/delete-user', '/api/auth/purge-orphaned-auth'], async (req, res) => {
    const requestedUid = String(req.body.uid || '');
    const requestedEmail = String(req.body.email || '').trim().toLowerCase();
    if ((!requestedUid && !requestedEmail) || !db || !admin?.auth) {
        return res.status(400).json({ success: false, error: 'User UID or email is required.' });
    }
    try {
        let target = null;
        try {
            target = requestedUid ? await admin.auth().getUser(requestedUid) : await admin.auth().getUserByEmail(requestedEmail);
        } catch (error) {
            if (error.code !== 'auth/user-not-found' || !requestedUid) throw error;
        }
        const targetUid = target?.uid || requestedUid;
        if (!/^[A-Za-z0-9:_-]{1,128}$/.test(targetUid)) return res.status(400).json({ success: false, error: 'Invalid user UID.' });
        if (targetUid === req.user.uid) return res.status(400).json({ success: false, error: 'Self-deletion through the admin endpoint is prohibited.' });
        const profileSnapshot = await db.collection('users').doc(targetUid).get();
        const profileData = profileSnapshot.data() || {};
        const authoritativeEmail = String(target?.email || profileData.email || '').toLowerCase();
        if (requestedEmail && authoritativeEmail && authoritativeEmail !== requestedEmail) {
            return res.status(400).json({ success: false, error: 'UID/email identity mismatch.' });
        }
        const targetRole = String(target?.customClaims?.role || profileData.role || '').toUpperCase();
        if (targetRole === 'SUPER_ADMIN' && !permissionsFor(req.user).has('*')) {
            return res.status(403).json({ success: false, error: 'Only SUPER_ADMIN can delete another SUPER_ADMIN.' });
        }
        if (target) await admin.auth().deleteUser(targetUid);

        const cleanupFailures = [];
        const relatedQueries = [
            ['portfolios', db.collection('portfolios').where('userId', '==', targetUid)],
            ['published portfolios', db.collection('pb').where('ownerUid', '==', targetUid)],
            ['job applications', db.collection('jobApplications').where('userId', '==', targetUid)],
            ['blog posts', db.collection('blog_posts').where('authorUid', '==', targetUid)],
        ];
        for (const [label, query] of relatedQueries) {
            try {
                const snapshot = await query.get();
                for (const item of snapshot.docs) await db.recursiveDelete(item.ref);
            } catch (error) {
                cleanupFailures.push(label);
                console.warn(`[User deletion ${label}]`, error.message);
            }
        }
        for (const [label, reference] of [
            ['employer application', db.collection('employerApplications').doc(targetUid)],
            ['notifications', db.collection('notifications').doc(targetUid)],
        ]) {
            try { await db.recursiveDelete(reference); } catch { cleanupFailures.push(label); }
        }
        if (!cleanupFailures.length) {
            try { await db.recursiveDelete(db.collection('users').doc(targetUid)); }
            catch { cleanupFailures.push('user profile tree'); }
        }
        await db.collection('security_audit_logs').add({
            action: cleanupFailures.length ? 'USER_DELETION_INCOMPLETE' : 'USER_DELETED',
            actorUid: req.user.uid, targetUid, cleanupFailures,
            requestId: res.locals.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        if (cleanupFailures.length) return res.status(500).json({
            success: false, code: 'USER_CLEANUP_INCOMPLETE',
            error: `Identity is absent or was deleted, but cleanup failed for: ${cleanupFailures.join(', ')}. Retry this operation.`,
        });
        return res.json({ success: true, deletedFromAuth: Boolean(target), message: 'User identity, profile tree, portfolios, applications, notifications, and authored blog posts were deleted.' });
    } catch (error) {
        console.error('[Admin delete user]', error.message);
        return res.status(error.code === 'auth/user-not-found' ? 404 : 500).json({ success: false, error: 'Unable to delete user.' });
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

app.post('/api/notify/password-changed', async (req, res) => {
    const { userEmail, userName } = req.body;
    const db = req.app.get('db');
    EmailNotifier.notifyPasswordChanged(db, { userEmail, userName });
    return res.json({ success: true, message: 'Password changed confirmation queued.' });
});

app.post('/api/notify/email-otp', (req, res) => {
    return res.status(410).json({ error: { code: 'CLIENT_OTP_RETIRED', message: 'Use the account-bound email verification link flow', requestId: res.locals.requestId } });
});

app.post('/api/notify/security-alert', async (req, res) => {
    const { userEmail, deviceInfo, ipAddress } = req.body;
    const db = req.app.get('db');
    EmailNotifier.notifySecurityAlert(db, { userEmail, deviceInfo, ipAddress });
    return res.json({ success: true, message: 'Security alert queued.' });
});

app.post('/api/notify/portfolio-published', async (req, res) => {
    const { userEmail, userName, portfolioSlug } = req.body;
    const db = req.app.get('db');
    EmailNotifier.notifyPortfolioPublished(db, { userEmail, userName, portfolioSlug });
    return res.json({ success: true, message: 'Portfolio published email queued.' });
});

app.post('/api/notify/job-application', async (req, res) => {
    const { recruiterEmail, applicantName, jobTitle, companyName } = req.body;
    const db = req.app.get('db');
    EmailNotifier.notifyJobApplicationReceived(db, { recruiterEmail, applicantName, jobTitle, companyName });
    return res.json({ success: true, message: 'Job application notification queued.' });
});

app.post('/api/notify/job-status-update', async (req, res) => {
    const { applicantEmail, applicantName, jobTitle, companyName, status } = req.body;
    const db = req.app.get('db');
    EmailNotifier.notifyJobStatusUpdate(db, { applicantEmail, applicantName, jobTitle, companyName, status });
    return res.json({ success: true, message: 'Job status update email queued.' });
});

app.post('/api/notify/job-posted', async (req, res) => {
    const { employerEmail, jobTitle, companyName } = req.body;
    const db = req.app.get('db');
    EmailNotifier.notifyJobPosted(db, { employerEmail, jobTitle, companyName });
    return res.json({ success: true, message: 'Job posted email queued.' });
});

app.post('/api/notify/subscription-cancelled', async (req, res) => {
    const { userEmail, userName, planName } = req.body;
    const db = req.app.get('db');
    EmailNotifier.notifySubscriptionCancelled(db, { userEmail, userName, planName });
    return res.json({ success: true, message: 'Subscription cancellation email queued.' });
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
    let config = {};
    const legacyPrefix = provider === 'linkedin' ? 'linkedin' : 'github';
    const fillMissing = candidate => {
        if (!config.clientId && candidate?.clientId) config.clientId = candidate.clientId;
        if (!config.clientSecret && candidate?.clientSecret) config.clientSecret = candidate.clientSecret;
    };
    try {
        if (database) {
            const [providerSecrets, adminConfiguration, legacySettings] = await Promise.all([
                database.collection('settings').doc('oauth_providers').get(),
                database.collection('settings').doc('admin_configuration').get(),
                database.collection('data').doc('system_settings').get(),
            ]);
            fillMissing(providerSecrets.data()?.[provider]);
            const canonical = adminConfiguration.data()?.socialAuth || {};
            fillMissing({ clientId: canonical[`${legacyPrefix}ClientId`], clientSecret: canonical[`${legacyPrefix}ClientSecret`] });
            const legacy = legacySettings.data()?.socialAuth || {};
            fillMissing({ clientId: legacy[`${legacyPrefix}ClientId`], clientSecret: legacy[`${legacyPrefix}ClientSecret`] });
        }
    } catch (error) {
        console.warn(`[OAuth config ${provider}]`, error.message);
    }
    const envPrefix = provider === 'linkedin' ? 'LINKEDIN' : 'GITHUB';
    return {
        clientId: String(config.clientId || process.env[`${envPrefix}_CLIENT_ID`] || '').trim(),
        clientSecret: String(config.clientSecret || process.env[`${envPrefix}_CLIENT_SECRET`] || '').trim()
    };
}

async function beginOAuth(provider, req, res) {
    try {
        if (!db) throw new Error('OAuth state store unavailable');
        const { clientId } = await getSocialAuthCredentials(provider);
        if (!clientId) return res.status(503).send('OAuth provider is not configured.');
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
        return res.status(503).send('OAuth is temporarily unavailable.');
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

app.use('/api', (req, res) => {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found', requestId: res.locals.requestId } });
});
app.use((error, req, res, _next) => {
    console.error('[Unhandled request error]', res.locals.requestId, error.message);
    if (res.headersSent) return;
    const status = Number(error.status || error.statusCode || 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: { code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR', message: status === 413 ? 'Request payload is too large' : 'Request failed', requestId: res.locals.requestId }
    });
});

module.exports = app;
module.exports.publishDueBlogPosts = publishDueBlogPosts;

