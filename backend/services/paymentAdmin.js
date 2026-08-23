'use strict';

const MASKED_SECRET = /[•*]/;
const PAYMENT_PROVIDERS = Object.freeze(['razorpay', 'stripe', 'paypal', 'paytm', 'phonepe']);

function paymentError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

/**
 * Normalize one write-only payment credential. A blank or masked form value is
 * an instruction to preserve the stored value, not to overwrite it. Deletion
 * is intentionally a separate boolean and deployment-managed credentials
 * cannot be cleared from the Admin UI.
 */
function resolveWriteOnlySecret({ value = '', existing = '', environment = '', clear = false, label = 'payment credential' } = {}) {
  const raw = String(value || '').trim();
  if (clear && String(environment || '').trim()) {
    throw paymentError('INFRASTRUCTURE_SECRET_CANNOT_CLEAR', `${label} is deployment-managed and cannot be cleared from the Admin UI.`, 409);
  }
  if (clear) return { value: '', action: 'CLEAR' };
  if (!raw || MASKED_SECRET.test(raw)) return { value: String(existing || ''), action: 'PRESERVE' };
  if (raw.length < 8 || raw.length > 1000 || /\p{Cc}/u.test(raw)) {
    throw paymentError('PAYMENT_SETTINGS_VALIDATION_ERROR', `Invalid ${label} length or format.`, 400);
  }
  return { value: raw, action: 'REPLACE' };
}

function maskWriteOnlySecret(value) {
  const raw = String(value || '').trim();
  return raw ? `••••${raw.slice(-4)}` : '';
}

function paymentCredentialStatus({ keyId = '', secret = '', envKeyId = '', envSecret = '' } = {}) {
  const effectiveId = String(envKeyId || keyId || '').trim();
  const effectiveSecret = String(envSecret || secret || '').trim();
  return {
    configured: Boolean(effectiveId && effectiveSecret),
    source: envSecret || envKeyId ? 'environment' : effectiveSecret || effectiveId ? 'firestore' : 'none',
    masked: maskWriteOnlySecret(effectiveSecret),
  };
}

function selectPaymentPair({ envId = '', envSecret = '', storedId = '', storedSecret = '', requiresId = true } = {}) {
  const environmentId = String(envId || '').trim();
  const environmentSecret = String(envSecret || '').trim();
  const persistedId = String(storedId || '').trim();
  const persistedSecret = String(storedSecret || '').trim();
  if ((!requiresId || environmentId) && environmentSecret) return { id: environmentId, secret: environmentSecret, source: 'environment' };
  if ((!requiresId || persistedId) && persistedSecret) return { id: persistedId, secret: persistedSecret, source: 'firestore' };
  if (environmentId || environmentSecret) return { id: environmentId, secret: environmentSecret, source: 'environment-partial' };
  if (persistedId || persistedSecret) return { id: persistedId, secret: persistedSecret, source: 'firestore-partial' };
  return { id: '', secret: '', source: 'none' };
}

function publicPaymentSettings(value) {
  const sensitive = /(?:secret|password|privatekey|authtoken|clientsecret|merchantkey|saltkey|keysecret|token|api[_-]?key|accesskey)/i;
  if (Array.isArray(value)) return value.map(publicPaymentSettings);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !sensitive.test(key))
    .map(([key, item]) => [key, publicPaymentSettings(item)]));
}

/**
 * Canonical, secret-free payment settings projection shared by the Admin UI and
 * the backwards-compatible `/api/admin/payment-settings` read alias.
 */
async function getPaymentSettingsProjection(db, environment = process.env) {
  if (!db) throw paymentError('PAYMENT_SETTINGS_UNAVAILABLE', 'Settings service unavailable.', 503);
  const [publicDoc, secretsDoc, legacyDoc] = await Promise.all([
    db.collection('data').doc('public_config').get(),
    db.collection('settings').doc('payment_providers').get(),
    db.collection('data').doc('subscriptions').get(),
  ]);
  const publicRoot = publicDoc.exists ? (publicDoc.data() || {}) : {};
  const legacyConfig = legacyDoc.exists ? (legacyDoc.data() || {}) : {};
  const publicConfig = publicPaymentSettings(publicRoot.subscriptions || legacyConfig);
  const secrets = secretsDoc.exists ? (secretsDoc.data() || {}) : {};
  const providers = {
    razorpay: selectPaymentPair({ envId: environment.RAZORPAY_KEY_ID, envSecret: environment.RAZORPAY_KEY_SECRET, storedId: secrets.razorpay?.keyId || publicConfig.razorpayKeyId || legacyConfig.razorpayKeyId, storedSecret: secrets.razorpay?.keySecret || legacyConfig.razorpayKeySecret }),
    stripe: selectPaymentPair({ envSecret: environment.STRIPE_SECRET, storedSecret: secrets.stripe?.secretKey || legacyConfig.stripeSecretKey, requiresId: false }),
    paypal: selectPaymentPair({ envId: environment.PAYPAL_CLIENT_ID, envSecret: environment.PAYPAL_CLIENT_SECRET, storedId: secrets.paypal?.clientId || publicConfig.paypalClientId || legacyConfig.paypalClientId, storedSecret: secrets.paypal?.clientSecret || legacyConfig.paypalClientSecret }),
    paytm: selectPaymentPair({ envId: environment.PAYTM_MID, envSecret: environment.PAYTM_MERCHANT_KEY, storedId: secrets.paytm?.mid || publicConfig.paytmMid || legacyConfig.paytmMid, storedSecret: secrets.paytm?.merchantKey || legacyConfig.paytmMerchantKey }),
    phonepe: selectPaymentPair({ envId: environment.PHONEPE_MERCHANT_ID, envSecret: environment.PHONEPE_SALT_KEY, storedId: secrets.phonepe?.merchantId || publicConfig.phonepeId || legacyConfig.phonepeId, storedSecret: secrets.phonepe?.saltKey || legacyConfig.phonepeSaltKey }),
  };
  const configuredProviders = Object.fromEntries(Object.entries(providers).map(([provider, pair]) => [provider, Boolean(pair.secret && (provider === 'stripe' || pair.id))]));
  const maskedKeys = Object.fromEntries(Object.entries(providers).map(([provider, pair]) => [provider, maskWriteOnlySecret(pair.secret)]));
  const credentialSources = Object.fromEntries(Object.entries(providers).map(([provider, pair]) => [provider, pair.source === 'environment' ? 'env' : pair.source === 'firestore' ? 'firestore' : pair.source]));
  return {
    settings: publicConfig,
    publicKeys: {
      razorpayKeyId: providers.razorpay.id || '',
      stripePublishableKey: publicConfig.stripePublishableKey || '',
      paypalClientId: providers.paypal.id || '',
      paytmMid: providers.paytm.id || '',
      phonepeId: providers.phonepe.id || '',
      phonepeSaltIndex: publicConfig.phonepeSaltIndex || secrets.phonepe?.saltIndex || environment.PHONEPE_SALT_INDEX || '1',
      paytmWebsite: publicConfig.paytmWebsite || secrets.paytm?.website || environment.PAYTM_WEBSITE || 'WEBSTAGING',
    },
    configuredProviders,
    maskedKeys,
    credentialSources,
    revision: Number(secrets._revision || publicRoot._settingsRevisions?.payments || 0),
    secretPolicy: {
      emptyField: 'PRESERVE',
      clear: 'EXPLICIT_ONLY',
      environmentManagedSecrets: Object.entries(credentialSources).filter(([, source]) => source.startsWith('env')).map(([provider]) => provider),
    },
  };
}

module.exports = {
  MASKED_SECRET,
  PAYMENT_PROVIDERS,
  paymentError,
  resolveWriteOnlySecret,
  maskWriteOnlySecret,
  paymentCredentialStatus,
  selectPaymentPair,
  getPaymentSettingsProjection,
};
