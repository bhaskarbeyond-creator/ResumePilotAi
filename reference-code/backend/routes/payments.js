'use strict';

const express = require('express');
const crypto = require('crypto');
const { chooseCredentialPair, readPersistedPaymentProviders, paypalConfig: paypalConfigShared, getRazorpayKeys: getRazorpayKeysShared, getPaytmConfig: getPaytmConfigShared, getPhonePeConfig: getPhonePeConfigShared } = require('../helpers/payment-providers');

/**
 * Payment routes — Stripe, PayPal, Razorpay, Paytm, PhonePe, entitlements.
 *
 * @param {object} deps
 * @param {object} deps.paymentActivation
 * @param {object} deps.indianGatewayActivation
 * @param {object} deps.stripeWebhookVerifier
 * @param {Function} deps.getStripeClient
 * @param {Function} deps.reconcileStripeChargeRefund
 * @param {Function} deps.validateStripePaymentIntent
 * @param {Function} deps.validatePayPalOrder
 * @param {Function} deps.validateRazorpaySignature
 * @param {Function} deps.validateRazorpayPayment
 * @param {Function} deps.validatePaytmPayment
 * @param {Function} deps.validatePhonePePayment
 * @param {Function} deps.assertInternalOrder
 * @param {Function} deps.billingSnapshotHash
 * @param {Function} deps.generateInvoice
 * @param {Function} deps.getInvoiceForUser
 * @param {Function} deps.listInvoicesForUser
 * @param {Function} deps.normalizeCustomerDetails
 * @param {Function} deps.supplierFromPublicConfig
 * @param {Function} deps.toCanonicalDate
 * @param {Function} deps.toCanonicalUser
 * @param {Function} deps.isMembershipActive
 * @param {Function} deps.isPaidMembershipTier
 * @param {Function} deps.getRepository
 * @param {object} deps.logger
 * @param {Function} deps.fetch
 * @param {object} deps.Stripe
 * @param {Array} deps.PAYMENT_PROVIDERS
 * @param {string} deps.protocol
 * @param {string} deps.websiteName
 */
function createPaymentRouter(deps) {
    const router = express.Router();
    const {
        paymentActivation, indianGatewayActivation, stripeWebhookVerifier,
        getStripeClient: getStripeClientFn, reconcileStripeChargeRefund: reconcileFn,
        validateStripePaymentIntent, validatePayPalOrder, validateRazorpaySignature,
        validateRazorpayPayment, validatePaytmPayment, validatePhonePePayment,
        assertInternalOrder, billingSnapshotHash, generateInvoice, getInvoiceForUser,
        listInvoicesForUser, normalizeCustomerDetails, supplierFromPublicConfig,
        toCanonicalDate, toCanonicalUser, isMembershipActive, isPaidMembershipTier,
        getRepository, logger, fetch, Stripe, PAYMENT_PROVIDERS,
        protocol, websiteName,
    } = deps;

    // ── Helpers ──

    async function getDynamicPlan(planId, provider) {
        const planMonths = { monthly: 1, halfYear: 6, yearly: 12 };
        if (!Object.hasOwn(planMonths, planId)) {
            const error = new Error('INVALID_PLAN'); error.status = 400; throw error;
        }
        const repo = getRepository();
        let publicConfig, systemSettings;
        try { [publicConfig, systemSettings] = await Promise.all([repo.getSetting('public_config'), repo.getSetting('system_settings')]); }
        catch (cause) { throw Object.assign(new Error('PAYMENT_CONFIGURATION_UNAVAILABLE'), { status: 503, cause }); }
        const billing = publicConfig?.subscriptions;
        if (!billing || typeof billing !== 'object' || billing.state !== true) throw Object.assign(new Error('PAYMENT_CONFIGURATION_UNAVAILABLE'), { code: 'PAYMENT_CONFIGURATION_UNAVAILABLE', status: 503 });
        if (!PAYMENT_PROVIDERS.includes(provider) || billing[`${provider}Enabled`] !== true) throw Object.assign(new Error('PAYMENT_PROVIDER_DISABLED'), { code: 'PAYMENT_PROVIDER_DISABLED', status: 409 });
        const currency = String(systemSettings?.currency || '').toUpperCase();
        if (currency !== 'INR' || String(billing.currency || '').toUpperCase() !== currency || billing.enableTax !== true || billing.taxInclusive !== true) throw Object.assign(new Error('PAYMENT_CONFIGURATION_INVALID'), { code: 'PAYMENT_CONFIGURATION_INVALID', status: 503 });
        const supplierSnapshot = supplierFromPublicConfig(publicConfig);
        let baseAmount;
        const matrix = billing.pricingMatrix?.[currency];
        if (matrix && Object.hasOwn(matrix, planId)) { baseAmount = Number(matrix[planId]); }
        else { const priceField = planId === 'monthly' ? 'monthlyPrice' : planId === 'yearly' ? 'yearlyPrice' : 'quartarlyPrice'; baseAmount = Number(billing[priceField]); }
        if (!Number.isFinite(baseAmount) || baseAmount <= 0) throw Object.assign(new Error('PAYMENT_CONFIGURATION_INVALID'), { status: 503 });
        const multiplier = currency === 'JPY' ? 1 : 100;
        return { amount: Math.round(baseAmount * multiplier), currency, months: planMonths[planId], supplierSnapshot };
    }

    async function createImmutableBillingContext(uid, details, supplierSnapshot) {
        const repo = getRepository();
        const customer = await repo.getUser(uid);
        if (!customer) throw Object.assign(new Error('PAYMENT_USER_NOT_FOUND'), { code: 'PAYMENT_USER_NOT_FOUND', status: 404 });
        const billingSnapshot = normalizeCustomerDetails(details, customer);
        return { billingSnapshot, supplierSnapshot, billingSnapshotHash: billingSnapshotHash(billingSnapshot, supplierSnapshot), billingSnapshotVersion: 1 };
    }

    async function createProviderOrderRecord({ uid, planId, provider, couponCode, billingDetails }) {
        const basePlan = await getDynamicPlan(planId, provider);
        const billingContext = await createImmutableBillingContext(uid, billingDetails, basePlan.supplierSnapshot);
        const created = await paymentActivation.createOrder({ uid, planId, provider, couponCode, plan: basePlan, extra: billingContext });
        return { ref: paymentActivation.asOrderRef(created.id), plan: created.plan || basePlan };
    }

    async function createPaymentOrder({ uid, planId, idempotencyKey, couponCode, billingDetails }) {
        const basePlan = await getDynamicPlan(planId, 'stripe');
        if (!basePlan) { const err = new Error('INVALID_PLAN'); err.status = 400; throw err; }
        const billingContext = await createImmutableBillingContext(uid, billingDetails, basePlan.supplierSnapshot);
        const stripeClient = await getStripeClientFn();
        const created = await paymentActivation.createOrder({ uid, planId, provider: 'stripe', couponCode, idempotencyKey, plan: basePlan, extra: billingContext });
        if (created.replayed && created.clientSecret) return { orderId: created.id, clientSecret: created.clientSecret, amount: created.amount, currency: created.currency, replayed: true };
        try {
            const intent = await stripeClient.paymentIntents.create({ amount: created.amount || created.plan?.amount || basePlan.amount, currency: created.currency || created.plan?.currency || basePlan.currency, metadata: { orderId: created.id, uid, planId } }, { idempotencyKey: `order:${created.id}` });
            await paymentActivation.updateOrder(created.id, { providerPaymentIntentId: intent.id, providerClientSecret: intent.client_secret, status: 'PAYMENT_CREATED' });
            return { orderId: created.id, clientSecret: intent.client_secret, amount: created.amount || created.plan?.amount || basePlan.amount, currency: created.currency || created.plan?.currency || basePlan.currency };
        } catch (err) {
            await paymentActivation.updateOrder(created.id, { status: 'FAILED', failureCode: 'PROVIDER_CREATE_FAILED' });
            await paymentActivation.releaseCouponReservation({ ...created, id: created.id });
            throw err;
        }
    }

    async function paypalAccessToken(baseUrl, clientId, clientSecret) {
        const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, { method: 'POST', headers: { 'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', timeout: 10_000 });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) throw Object.assign(new Error('PAYPAL_AUTH_FAILED'), { status: 502 });
        return tokenData.access_token;
    }

    // Bound wrappers: the shared helpers take getRepository as a parameter,
    // but existing call sites expect zero-argument functions.
    const paypalConfig = () => paypalConfigShared(getRepository);
    const getRazorpayKeys = () => getRazorpayKeysShared(getRepository);
    const getPaytmConfig = () => getPaytmConfigShared(getRepository);
    const getPhonePeConfig = () => getPhonePeConfigShared(getRepository);

    // ── Routes ──

    router.post('/pay', async (req, res) => {
        try {
            const suppliedKey = String(req.get('idempotency-key') || '');
            const idempotencyKey = /^ck_[A-Za-z0-9_-]{10,100}$/.test(suppliedKey) ? suppliedKey : crypto.randomUUID();
            const result = await createPaymentOrder({ uid: req.user.uid, planId: req.body.planId || req.body.plan, idempotencyKey, couponCode: req.body.couponCode, billingDetails: req.body.billingDetails });
            return res.status(201).json({ orderId: result.orderId, client_secret: result.clientSecret, amount: result.amount, currency: result.currency, status: 'PAYMENT_PENDING' });
        } catch (err) {
            logger.error('[Stripe payment create]', { error: err.message, requestId: res.locals.requestId });
            return res.status(err.status || 500).json({ error: { code: err.message === 'INVALID_PLAN' ? 'INVALID_PLAN' : 'PAYMENT_UNAVAILABLE', message: 'Unable to create payment', requestId: res.locals.requestId } });
        }
    });

    // Payment history is read directly from the owner-bound MariaDB ledger. Profile
    // JSON is not a second payment-history store.
    router.get('/payment-orders', async (req, res) => {
        try {
            const orders = await getRepository().getUserPaymentOrders(req.user.uid);
            res.setHeader('Cache-Control', 'no-store, private');
            return res.json({ success: true, orders, source: 'MARIADB_PAYMENT_ORDERS', count: orders.length });
        } catch (error) {
            return res.status(error.status || 503).json({ success: false, code: error.code || 'PAYMENT_HISTORY_UNAVAILABLE', error: 'Payment history is unavailable.', requestId: res.locals.requestId });
        }
    });

    // Payment status is read from a server-owned order and is bound to the verified caller.
    router.get('/payment-orders/:orderId', async (req, res) => {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.orderId)) return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found', requestId: res.locals.requestId } });
        try {
            const order = await paymentActivation.getOrder(req.params.orderId);
            if (!order || order.uid !== req.user.uid) return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found', requestId: res.locals.requestId } });
            let invoiceNumber = null; let invoiceStatus = order.status === 'ACTIVE' ? 'NOT_ISSUED' : 'NOT_APPLICABLE';
            if (order.status === 'ACTIVE' && Number(order.billingSnapshotVersion) === 1) {
                try { const invoice = await getInvoiceForUser({ uid: req.user.uid, paymentOrderId: req.params.orderId }); invoiceNumber = invoice.invoiceNumber; invoiceStatus = 'ISSUED'; }
                catch (cause) { throw Object.assign(new Error('Active payment invoice invariant failed'), { code: 'ACTIVATION_INVOICE_INTEGRITY_FAILED', status: 503, cause }); }
            } else if (order.status === 'ACTIVE') { invoiceStatus = 'LEGACY_NOT_CAPTURED'; }
            return res.json({ orderId: order.id || req.params.orderId, status: order.status, planId: order.planId, membershipEnds: toCanonicalDate(order.membershipEnds) || null, invoiceStatus, invoiceNumber });
        } catch (error) { return res.status(error.status || 503).json({ error: { code: error.code || 'ORDER_UNAVAILABLE', message: 'Order could not be loaded', requestId: res.locals.requestId } }); }
    });

    // Stripe webhook — verified, idempotent MariaDB subscription activation
    router.post('/stripe-webhook', async (req, res) => {
        const sig = req.headers['stripe-signature']; let event;
        try {
            if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('Stripe webhook is not configured');
            event = stripeWebhookVerifier.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        } catch (err) { logger.error('[Stripe Webhook] Signature error:', { error: err.message, requestId: res.locals.requestId }); return res.status(400).send(`Webhook Error: ${err.message}`); }
        if (event.type === 'payment_intent.succeeded') {
            const paymentData = event.data.object; const orderId = paymentData.metadata?.orderId;
            if (!orderId) return res.status(400).json({ error: 'Unknown payment order' });
            const order = await paymentActivation.getOrder(orderId);
            if (!order) return res.status(400).json({ error: 'Unknown payment order' });
            try { validateStripePaymentIntent(order, paymentData, orderId); } catch (_) { return res.status(400).json({ error: 'Payment order mismatch' }); }
            const claimed = await paymentActivation.claimWebhookEvent({ eventId: event.id, provider: 'stripe', eventType: event.type, orderId });
            if (claimed.duplicate) return res.json({ received: true, duplicate: true });
            console.log(`[Stripe Webhook] verified order ${orderId}`);
            try {
                const activated = await paymentActivation.activateVerifiedOrder({ orderId, gatewayLabel: 'Stripe', providerPaymentId: paymentData.id });
                return res.json({ received: true, status: 'activated', userId: order.uid, membership: activated.membership || 'Premium', membershipEnds: toCanonicalDate(activated.membershipEnds) || activated.membershipEnds, invoiceStatus: activated.invoiceStatus, invoiceNumber: activated.invoice?.invoiceNumber || null });
            } catch (err) { await paymentActivation.releaseWebhookEvent(event.id).catch(releaseError => { logger.error('[Stripe Webhook] event release failed:', { error: releaseError.message, requestId: res.locals.requestId }); }); throw err; }
        }
        if (event.type === 'payment_intent.payment_failed') {
            const payment = event.data.object; const orderId = payment.metadata?.orderId;
            if (orderId) { const order = await paymentActivation.getOrder(orderId); if (order && order.providerPaymentIntentId === payment.id) { const claimed = await paymentActivation.claimWebhookEvent({ eventId: event.id, provider: 'stripe', eventType: event.type, orderId }); if (!claimed.duplicate) await paymentActivation.updateOrder(orderId, { status: 'FAILED', failureCode: payment.last_payment_error?.code || 'PAYMENT_FAILED' }); } }
            return res.json({ received: true });
        }
        if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
            const providerObject = event.data.object; const paymentIntentId = providerObject.payment_intent;
            if (!paymentIntentId) return res.status(400).json({ error: 'Unknown payment order' });
            const matched = await paymentActivation.findByProviderIntent(paymentIntentId);
            if (!matched) return res.status(400).json({ error: 'Unknown payment order' });
            if (Number(providerObject.amount) !== Number(matched.amount) || String(providerObject.currency || '').toUpperCase() !== String(matched.currency || '').toUpperCase()) return res.status(400).json({ error: 'Payment reversal amount or currency mismatch' });
            const status = event.type === 'charge.refunded' ? 'REFUNDED' : 'CHARGEBACK';
            if (status === 'REFUNDED' && Number(providerObject.amount_refunded) !== Number(providerObject.amount)) return res.status(409).json({ error: 'Entitlement reversal requires a completed full refund.' });
            const claimed = await paymentActivation.claimWebhookEvent({ eventId: event.id, provider: 'stripe', eventType: event.type, orderId: matched.id });
            if (claimed.duplicate) return res.json({ received: true, duplicate: true });
            try {
                let reconciliation = null;
                if (status === 'REFUNDED') reconciliation = await reconcileFn({ stripeClient: await getStripeClientFn(), charge: providerObject, order: matched });
                const reversed = await paymentActivation.reverseEntitlement({ orderId: matched.id, status, providerRefundId: reconciliation?.refundReference || null, providerRefundReferenceType: reconciliation?.referenceType || null, providerRefunds: reconciliation?.refunds || [] });
                return res.json({ received: true, status: status.toLowerCase(), creditNoteNumber: reversed.creditNote?.creditNoteNumber || null });
            } catch (error) { await paymentActivation.releaseWebhookEvent(event.id).catch(releaseError => { logger.error('[Stripe Webhook] reversal event release failed:', { error: releaseError.message, requestId: res.locals.requestId }); }); throw error; }
        }
        return res.json({ received: true });
    });

    // PayPal orders are created server-side so amount, currency, plan and owner are bound
    // before the browser is allowed to approve or capture the provider order.
    router.post('/paypal/create-order', async (req, res) => {
        let orderRef;
        try {
            const { clientId, clientSecret, baseUrl } = await paypalConfig();
            const { ref, plan } = await createProviderOrderRecord({ uid: req.user.uid, planId: req.body.planId || req.body.plan, provider: 'paypal', couponCode: req.body.couponCode, billingDetails: req.body.billingDetails });
            orderRef = ref;
            const accessToken = await paypalAccessToken(baseUrl, clientId, clientSecret);
            const paypalRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': ref.id },
                body: JSON.stringify({
                    intent: 'CAPTURE',
                    purchase_units: [{
                        reference_id: ref.id,
                        custom_id: req.user.uid,
                        description: `${req.body.planId || req.body.plan} ResumePilot subscription`,
                        amount: { currency_code: plan.currency, value: (plan.amount / 100).toFixed(2) }
                    }]
                }),
                timeout: 10_000
            });
            const paypalOrder = await paypalRes.json();
            if (!paypalRes.ok || !paypalOrder.id) throw new Error('PAYPAL_CREATE_FAILED');
            await paymentActivation.updateOrder(ref.id, { providerOrderId: paypalOrder.id, status: 'PAYMENT_CREATED' });
            return res.status(201).json({ orderId: paypalOrder.id, paymentOrderId: ref.id, amount: plan.amount, currency: plan.currency });
        } catch (err) {
            if (orderRef) {
                await paymentActivation.updateOrder(orderRef.id, { status: 'FAILED', failureCode: 'PROVIDER_CREATE_FAILED' }).catch(() => {});
                await paymentActivation.releaseCouponReservation({ id: orderRef.id }).catch(() => {});
            }
            logger.error('[PayPal create order]', { error: err.message, requestId: res.locals.requestId });
            return res.status(err.status || 502).json({ error: { code: err.message, message: 'Unable to create PayPal order', requestId: res.locals.requestId } });
        }
    });

    router.post('/paypal/verify', async (req, res) => {
        try {
            // BASELINE CONTRACT: orderId = PayPal order ID, paymentOrderId = Internal order ID
            const providerOrderId = String(req.body.orderId || '').trim();
            const paymentOrderId = String(req.body.paymentOrderId || '').trim();
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
            const active = await paymentActivation.activateVerifiedOrder({ orderId: paymentOrderId, gatewayLabel: 'PayPal', providerPaymentId: captureId || providerOrderId });
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
            logger.error('[PayPal verify]', { error: err.message, requestId: res.locals.requestId });
            return res.status(err.status || 502).json({ verified: false, error: 'PayPal verification unavailable' });
        }
    });

    router.post('/razorpay/create-order', async (req, res) => {
        // Ownership and amount are server-controlled; reject any client attempt to supply them.
        const clientIdentityFields = ['userId', 'uid', 'ownerUid', 'amount', 'keyId', 'keySecret'];
        if (clientIdentityFields.some(f => Object.hasOwn(req.body || {}, f))) {
            return res.status(400).json({ error: { code: 'CLIENT_PAYMENT_IDENTITY_REJECTED', message: 'Payment ownership and amounts are server-controlled', requestId: res.locals.requestId } });
        }
        let orderRef;
        try {
            const { keyId, keySecret } = await getRazorpayKeys();
            if (!keyId || !keySecret) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
            const { ref, plan } = await createProviderOrderRecord({ uid: req.user.uid, planId: req.body.planId || req.body.plan, provider: 'razorpay', couponCode: req.body.couponCode, billingDetails: req.body.billingDetails });
            orderRef = ref;
            const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
                method: 'POST',
                headers: { 'Authorization': 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: plan.amount, currency: plan.currency, receipt: ref.id, notes: { paymentOrderId: ref.id, uid: req.user.uid, planId: req.body.planId || req.body.plan } }),
                timeout: 10_000
            });
            const razorpayOrder = await razorpayRes.json();
            if (!razorpayRes.ok || !razorpayOrder.id) throw new Error('RAZORPAY_CREATE_FAILED');
            await paymentActivation.updateOrder(ref.id, { providerOrderId: razorpayOrder.id, status: 'PAYMENT_CREATED' });
            return res.status(201).json({ id: razorpayOrder.id, paymentOrderId: ref.id, amount: plan.amount, currency: plan.currency, key: keyId });
        } catch (err) {
            if (orderRef) {
                await paymentActivation.updateOrder(orderRef.id, { status: 'FAILED', failureCode: 'PROVIDER_CREATE_FAILED' }).catch(() => {});
                await paymentActivation.releaseCouponReservation({ id: orderRef.id }).catch(() => {});
            }
            logger.error('[Razorpay create order]', { error: err.message, requestId: res.locals.requestId });
            const status = Number(err.status) || 502;
            const code = status === 503 && !orderRef ? 'PAYMENT_PROVIDER_UNAVAILABLE' : 'RAZORPAY_CREATE_FAILED';
            return res.status(status).json({ error: { code, message: 'Unable to create Razorpay order', requestId: res.locals.requestId } });
        }
    });

    router.post('/razorpay/verify-payment', async (req, res) => {
        try {
            // BASELINE CONTRACT: razorpay_order_id = provider order ID, paymentOrderId = internal order ID
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
            const active = await paymentActivation.activateVerifiedOrder({ orderId: paymentOrderId, gatewayLabel: 'Razorpay', providerPaymentId: paymentId });
            return res.json({
                verified: true,
                status: active.status,
                paymentOrderId,
                membershipEnds: active.membershipEnds,
                invoiceStatus: active.invoiceStatus,
                invoiceNumber: active.invoice?.invoiceNumber || null,
            });
        } catch (err) {
            logger.error('[Razorpay verify]', { error: err.message, requestId: res.locals.requestId });
            return res.status(err.status || 502).json({ verified: false, error: 'Razorpay verification unavailable' });
        }
    });

    router.post('/paytm/initiate-transaction', async (req, res) => {
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
            await paymentActivation.updateOrder(ref.id, { providerOrderId, status: 'PAYMENT_CREATED' });
            return res.status(201).json({ success: true, txnToken: providerData.body.txnToken, orderId: providerOrderId, paymentOrderId: ref.id, mid, amount: txnAmount, isLive });
        } catch (err) {
            logger.error('[Paytm initiate]', { error: err.message, requestId: res.locals.requestId });
            if (orderRef) await paymentActivation.releaseCouponReservation({ id: orderRef.id }).catch(() => {});
            const unavailable = err.message === 'PAYMENT_PROVIDER_UNAVAILABLE';
            return res.status(err.status || (unavailable ? 503 : 502)).json({
                success: false,
                code: unavailable ? 'PAYMENT_PROVIDER_UNAVAILABLE' : 'PAYMENT_CREATE_FAILED',
                configurationState: unavailable ? 'NOT_CONFIGURED' : 'CONFIGURED',
                error: unavailable ? 'Paytm is not configured' : 'Unable to initiate Paytm transaction',
                requestId: res.locals.requestId,
            });
        }
    });

    router.post('/paytm/verify-transaction', async (req, res) => {
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
            const active = await paymentActivation.activateVerifiedOrder({ orderId, gatewayLabel: 'Paytm', providerPaymentId });
            return res.json({
                verified: true,
                status: active.status,
                txnId: body.txnId,
                orderId,
                membershipEnds: toCanonicalDate(active.membershipEnds) || active.membershipEnds,
                invoiceStatus: active.invoiceStatus,
                invoiceNumber: active.invoice?.invoiceNumber || null,
            });
        } catch (err) {
            logger.error('[Paytm verify]', { error: err.message, requestId: res.locals.requestId });
            return res.status(err.status || 500).json({ error: { code: err.code || 'PAYMENT_VERIFICATION_FAILED', message: 'Unable to verify Paytm transaction', requestId: res.locals.requestId } });
        }
    });

    router.post('/phonepe/initiate', async (req, res) => {
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
            await paymentActivation.updateOrder(ref.id, { providerOrderId: ref.id, status: 'PAYMENT_CREATED' });
            return res.status(201).json({ success: true, orderId: ref.id, paymentOrderId: ref.id, redirectUrl: parsedRedirect.href, isLive });
        } catch (err) {
            logger.error('[PhonePe initiate]', { error: err.message, requestId: res.locals.requestId });
            if (orderRef) await paymentActivation.releaseCouponReservation({ id: orderRef.id }).catch(() => {});
            const unavailable = err.message === 'PAYMENT_PROVIDER_UNAVAILABLE';
            return res.status(err.status || (unavailable ? 503 : 502)).json({
                success: false,
                code: unavailable ? 'PAYMENT_PROVIDER_UNAVAILABLE' : 'PAYMENT_CREATE_FAILED',
                configurationState: unavailable ? 'NOT_CONFIGURED' : 'CONFIGURED',
                error: unavailable ? 'PhonePe is not configured' : 'Unable to initiate PhonePe payment',
                requestId: res.locals.requestId,
            });
        }
    });

    router.post('/phonepe/status', async (req, res) => {
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
            const active = await paymentActivation.activateVerifiedOrder({ orderId, gatewayLabel: 'PhonePe', providerPaymentId: paymentId });
            return res.json({
                verified: true,
                status: active.status,
                state: providerData.data.state,
                paymentId,
                orderId,
                membershipEnds: toCanonicalDate(active.membershipEnds) || active.membershipEnds,
                invoiceStatus: active.invoiceStatus,
                invoiceNumber: active.invoice?.invoiceNumber || null,
            });
        } catch (err) {
            logger.error('[PhonePe status]', { error: err.message, requestId: res.locals.requestId });
            return res.status(err.status || 500).json({ error: { code: err.code || 'PAYMENT_STATUS_FAILED', message: 'Unable to check PhonePe status', requestId: res.locals.requestId } });
        }
    });

    router.post('/paytm/callback', async (req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        try {
            const orderId = String(req.body?.ORDERID || req.body?.orderId || '').trim();
            await indianGatewayActivation.handlePaytmCallback({ orderId, getPaytmConfig, fetchImpl: fetch, activation: paymentActivation });
        } catch (error) { console.warn('[Paytm callback]', error.code || error.message); }
        return res.status(200).send(indianGatewayActivation.paytmCallbackHtml());
    });

    router.post('/phonepe/callback', async (req, res) => {
        try {
            const base64Response = String(req.body?.response || req.body?.RESPONSE || '').trim();
            const verifyHeader = String(req.get('X-VERIFY') || req.get('x-verify') || '');
            await indianGatewayActivation.handlePhonePeCallback({ base64Response, verifyHeader, getPhonePeConfig, fetchImpl: fetch, activation: paymentActivation });
            return res.status(200).json({ success: true, received: true });
        } catch (error) {
            if (error.code === 'PHONEPE_SIGNATURE_INVALID' || Number(error.status) === 400) return res.status(400).json({ success: false, error: { code: error.code || 'PHONEPE_SIGNATURE_INVALID', message: 'Invalid PhonePe callback signature', requestId: res.locals.requestId } });
            console.warn('[PhonePe callback]', error.code || error.message);
            if (Number(error.status) === 503) return res.status(503).json({ success: false, error: { code: error.code || 'PAYMENT_PROVIDER_UNAVAILABLE', message: 'PhonePe is not configured', requestId: res.locals.requestId } });
            return res.status(200).json({ success: true, received: true });
        }
    });

    router.post('/subscription/preferences', (_req, res) => {
        return res.status(410).json({ success: false, code: 'NON_RECURRING_PLAN', error: 'ResumePilot plans are fixed-term one-time purchases and do not renew automatically.', requestId: res.locals.requestId });
    });

    router.post('/check', async (req, res) => {
        const legacyClientFields = ['accountType', 'expDate', 'membership', 'paymentStatus', 'membershipEnds'];
        if (legacyClientFields.some(f => Object.hasOwn(req.body || {}, f))) return res.status(503).json({ status: 'false', error: 'Client-supplied entitlement context is not accepted' });
        try {
            const repo = getRepository();
            const user = await repo.getUser(req.user.uid);
            if (!user) return res.json({ status: 'false', membershipEnds: null });
            const canonical = toCanonicalUser(user);
            const entitled = isMembershipActive(canonical) || (isPaidMembershipTier(canonical.membership) && ['ACTIVE', 'ADMIN_GRANTED'].includes(String(canonical.paymentStatus || '').toUpperCase()) && (!canonical.membershipEnds || new Date(canonical.membershipEnds) > new Date()));
            return res.json({ status: entitled ? 'true' : 'false', membershipEnds: entitled ? (canonical.membershipEnds || null) : null });
        } catch (error) { logger.error('[Entitlement check]', { error: error.message, requestId: res.locals.requestId }); return res.status(500).json({ status: 'false', error: 'Entitlement check failed' }); }
    });

    router.post('/payment/razorpay-order', (req, res) => {
        return res.status(410).json({ error: { code: 'LEGACY_PAYMENT_ENDPOINT_RETIRED', message: 'Use /api/razorpay/create-order with a planId', requestId: res.locals.requestId } });
    });

    return router;
}

module.exports = { createPaymentRouter };
