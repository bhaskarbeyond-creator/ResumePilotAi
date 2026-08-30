'use strict';

/**
 * Shared payment provider configuration helpers.
 * Single authoritative implementation used by both index.js (admin routes)
 * and routes/payments.js (extracted payment routes).
 *
 * BASELINE CONTRACT: These functions MUST match the behavior of the
 * original implementations in baseline SHA 0436977 exactly.
 */

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

async function readPersistedPaymentProviders(getRepository) {
    const repo = getRepository();
    const [providers, publicRoot] = await Promise.all([repo.getSetting('payment_providers'), repo.getSetting('public_config')]);
    if (!publicRoot || typeof publicRoot !== 'object' || !publicRoot.subscriptions || typeof publicRoot.subscriptions !== 'object') throw Object.assign(new Error('PAYMENT_CONFIGURATION_UNAVAILABLE'), { status: 503 });
    return { providers: providers && typeof providers === 'object' ? providers : {}, publicConfig: publicRoot.subscriptions };
}

async function paypalConfig(getRepository) {
    const envClientId = String(process.env.PAYPAL_CLIENT_ID || '').trim(); const envClientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
    let environment = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase(); let storedClientId = ''; let storedClientSecret = ''; let storedEnvironment = '';
    const persistedPaypal = await readPersistedPaymentProviders(getRepository);
    { const stored = persistedPaypal.providers.paypal || {}; const publicConfig = persistedPaypal.publicConfig || {}; storedClientId = String(stored.clientId || publicConfig.paypalClientId || '').trim(); storedClientSecret = String(stored.clientSecret || '').trim(); storedEnvironment = String(stored.environment || '').trim(); }
    const selected = chooseCredentialPair({ environmentId: envClientId, environmentSecret: envClientSecret, storedId: storedClientId, storedSecret: storedClientSecret });
    if (storedEnvironment && selected.source === 'mysql') environment = storedEnvironment.toLowerCase();
    if (!selected.id || !selected.secret) throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { status: 503 });
    const baseUrl = environment === 'live' || environment === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    return { clientId: selected.id, clientSecret: selected.secret, baseUrl, source: selected.source };
}

async function getRazorpayKeys(getRepository) {
    const envKeyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
    const envKeySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
    // A complete environment pair is deployment-managed and wins as a pair. Do
    // not combine an old environment key ID with a newly saved MariaDB secret.
    if (envKeyId && envKeySecret) return { keyId: envKeyId, keySecret: envKeySecret, source: 'environment' };
    const persisted = await readPersistedPaymentProviders(getRepository);
    const stored = persisted.providers.razorpay || {};
    const storedKeyId = String(stored.keyId || persisted.publicConfig?.razorpayKeyId || '').trim();
    const storedSecret = String(stored.keySecret || '').trim();
    const selected = chooseCredentialPair({ environmentId: envKeyId, environmentSecret: envKeySecret, storedId: storedKeyId, storedSecret });
    return { keyId: selected.id, keySecret: selected.secret, source: selected.source };
}

async function getPaytmConfig(getRepository) {
    const envMid = String(process.env.PAYTM_MID || '').trim();
    const envKey = String(process.env.PAYTM_MERCHANT_KEY || '').trim();
    let website = String(process.env.PAYTM_WEBSITE || '').trim();
    const channelId = process.env.PAYTM_CHANNEL_ID || 'WEB';
    const env = (process.env.PAYTM_ENV || 'staging').toLowerCase();
    const isLive = env === 'production' || env === 'live';
    const baseUrl = isLive ? 'https://securegw.paytm.in' : 'https://securegw-stage.paytm.in';
    if (envMid && envKey) return { mid: envMid, key: envKey, website, channelId, baseUrl, isLive, source: 'environment' };

    const persisted = await readPersistedPaymentProviders(getRepository);
    const stored = persisted.providers.paytm || {};
    const publicConfig = persisted.publicConfig || {};
    const storedMid = String(stored.mid || publicConfig.paytmMid || '').trim();
    const storedKey = String(stored.merchantKey || '').trim();
    if (stored.website || publicConfig.paytmWebsite) website = stored.website || publicConfig.paytmWebsite;
    const selected = chooseCredentialPair({ environmentId: envMid, environmentSecret: envKey, storedId: storedMid, storedSecret: storedKey });
    return { mid: selected.id, key: selected.secret, website, channelId, baseUrl, isLive, source: selected.source };
}

async function getPhonePeConfig(getRepository) {
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

    const persisted = await readPersistedPaymentProviders(getRepository);
    const stored = persisted.providers.phonepe || {};
    const publicConfig = persisted.publicConfig || {};
    const storedMerchantId = String(stored.merchantId || publicConfig.phonepeId || '').trim();
    const storedSaltKey = String(stored.saltKey || '').trim();
    if (stored.saltIndex || publicConfig.phonepeSaltIndex) saltIndex = Number.parseInt(stored.saltIndex || publicConfig.phonepeSaltIndex, 10);
    const selected = chooseCredentialPair({ environmentId: envMerchantId, environmentSecret: envSaltKey, storedId: storedMerchantId, storedSecret: storedSaltKey });
    return { merchantId: selected.id, saltKey: selected.secret, saltIndex, baseUrl, isLive, source: selected.source };
}

module.exports = {
    chooseCredentialPair,
    readPersistedPaymentProviders,
    paypalConfig,
    getRazorpayKeys,
    getPaytmConfig,
    getPhonePeConfig,
};
