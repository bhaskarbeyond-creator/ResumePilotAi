'use strict';

const CURRENCY_REGISTRY = Object.freeze({
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', subunit: 'Paise', decimals: 2, defaultLocale: 'en-IN' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', subunit: 'Cents', decimals: 2, defaultLocale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', subunit: 'Cents', decimals: 2, defaultLocale: 'de-DE' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', subunit: 'Pence', decimals: 2, defaultLocale: 'en-GB' },
  CAD: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', subunit: 'Cents', decimals: 2, defaultLocale: 'en-CA' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', subunit: 'Cents', decimals: 2, defaultLocale: 'en-AU' },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', subunit: 'Cents', decimals: 2, defaultLocale: 'en-SG' },
  AED: { code: 'AED', symbol: 'AED ', name: 'UAE Dirham', subunit: 'Fils', decimals: 2, defaultLocale: 'ar-AE' },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', subunit: 'Sen', decimals: 0, defaultLocale: 'ja-JP' },
});

function normalizeCurrencyCode(input) {
  const code = String(input || '').trim().toUpperCase();
  if (CURRENCY_REGISTRY[code]) return code;
  if (code === 'RUPEES' || code === 'RS') return 'INR';
  if (code === 'DOLLARS' || code === 'DOLLAR') return 'USD';
  if (code === 'EUROS') return 'EUR';
  if (code === 'POUNDS') return 'GBP';
  return 'INR';
}

function getCurrencyMeta(code) {
  const normalized = normalizeCurrencyCode(code);
  return CURRENCY_REGISTRY[normalized] || CURRENCY_REGISTRY.INR;
}

function formatCurrencyAmount(amount, currencyCode = 'INR') {
  const num = Number(amount || 0);
  const meta = getCurrencyMeta(currencyCode);
  const formatted = num.toLocaleString(meta.defaultLocale, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });
  return `${meta.symbol}${formatted}`;
}

// The fallback must carry the same authoritative shape as a healthy read —
// `supportedCurrencies` is a static registry fact, so a momentarily unavailable
// store can never degrade into a currency-agnostic response.
function fallbackCurrencyConfig() {
  return {
    ...CURRENCY_REGISTRY.INR,
    supportedCurrencies: Object.keys(CURRENCY_REGISTRY),
    allowMultiCurrency: false,
    source: 'fallback-default',
  };
}

async function getPlatformCurrencyConfig(db) {
  if (!db) return fallbackCurrencyConfig();
  try {
    const [sysDoc, pubDoc, subDoc, payDoc] = await Promise.all([
      db.collection('data').doc('system_settings').get().catch(() => ({ exists: false, data: () => ({}) })),
      db.collection('data').doc('public_config').get().catch(() => ({ exists: false, data: () => ({}) })),
      db.collection('data').doc('subscriptions').get().catch(() => ({ exists: false, data: () => ({}) })),
      db.collection('settings').doc('payment_providers').get().catch(() => ({ exists: false, data: () => ({}) })),
    ]);
    const sysData = (sysDoc && typeof sysDoc.data === 'function') ? (sysDoc.data() || {}) : {};
    const pubData = (pubDoc && typeof pubDoc.data === 'function') ? (pubDoc.data() || {}) : {};
    const subData = (subDoc && typeof subDoc.data === 'function') ? (subDoc.data() || {}) : {};
    const payData = (payDoc && typeof payDoc.data === 'function') ? (payDoc.data() || {}) : {};

    const code = normalizeCurrencyCode(
      sysData.currency ||
      sysData.defaultCurrency ||
      pubData.currency ||
      pubData.subscriptions?.currency ||
      pubData.currencyMeta?.code ||
      subData.currency ||
      payData.currency ||
      process.env.DEFAULT_CURRENCY ||
      process.env.CURRENCY ||
      'INR'
    );
    const meta = getCurrencyMeta(code);
    return {
      ...meta,
      supportedCurrencies: Object.keys(CURRENCY_REGISTRY),
      allowMultiCurrency: Boolean(sysData.allowMultiCurrency ?? pubData.allowMultiCurrency),
      source: (sysDoc?.exists && sysData.currency) ? 'system_settings' : (pubDoc?.exists && (pubData.currency || pubData.subscriptions?.currency)) ? 'public_config' : 'default',
      updatedAt: sysData.currencyUpdatedAt || pubData.updatedAt || null,
    };
  } catch (error) {
    return { ...fallbackCurrencyConfig(), source: 'error-fallback' };
  }
}

async function setPlatformCurrencyConfig({ db, admin, currency, allowMultiCurrency, actorUid, requestId }) {
  if (!db || !admin?.firestore?.FieldValue) {
    throw Object.assign(new Error('Database unavailable'), { code: 'DATABASE_UNAVAILABLE', status: 503 });
  }
  const normalized = normalizeCurrencyCode(currency);
  const meta = getCurrencyMeta(normalized);
  
  let beforeState = null;
  const sysRef = db.collection('data').doc('system_settings');
  const pubRef = db.collection('data').doc('public_config');
  
  await db.runTransaction(async transaction => {
    const sysSnap = await transaction.get(sysRef);
    const existing = sysSnap.data() || {};
    beforeState = {
      currency: existing.currency || 'INR',
      allowMultiCurrency: Boolean(existing.allowMultiCurrency),
    };
    
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(sysRef, {
      currency: normalized,
      currencyMeta: meta,
      allowMultiCurrency: Boolean(allowMultiCurrency),
      currencyUpdatedAt: now,
      currencyUpdatedBy: actorUid || 'system',
    }, { merge: true });
    
    transaction.set(pubRef, {
      currency: normalized,
      currencySymbol: meta.symbol,
      allowMultiCurrency: Boolean(allowMultiCurrency),
    }, { merge: true });
    
    transaction.set(db.collection('security_audit_logs').doc(), {
      action: 'PLATFORM_CURRENCY_UPDATED',
      actorUid: actorUid || 'system',
      category: 'platform.configuration',
      severity: 'HIGH',
      targetType: 'PLATFORM_CONFIG',
      targetId: 'currency',
      changes: {
        before: beforeState,
        after: { currency: normalized, allowMultiCurrency: Boolean(allowMultiCurrency) }
      },
      requestId: requestId || null,
      createdAt: now,
    });
  });
  
  return {
    ...meta,
    allowMultiCurrency: Boolean(allowMultiCurrency),
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  CURRENCY_REGISTRY,
  normalizeCurrencyCode,
  getCurrencyMeta,
  formatCurrencyAmount,
  getPlatformCurrencyConfig,
  setPlatformCurrencyConfig,
};
