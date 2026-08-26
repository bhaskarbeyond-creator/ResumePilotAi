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

const { getRepository } = require('../repositories');

async function getPlatformCurrencyConfig(db) {
  // 1. Primary: MariaDB system_settings
  try {
    const repo = getRepository(db);
    if (repo && typeof repo.getSetting === 'function') {
      const [sysSetting, pubSetting] = await Promise.all([
        repo.getSetting('system_settings').catch(() => null),
        repo.getSetting('public_config').catch(() => null),
      ]);
      const sysData = sysSetting || {};
      const pubData = pubSetting || {};
      const code = normalizeCurrencyCode(
        sysData.currency ||
        sysData.defaultCurrency ||
        pubData.currency ||
        pubData.subscriptions?.currency ||
        pubData.currencyMeta?.code ||
        process.env.DEFAULT_CURRENCY ||
        process.env.CURRENCY ||
        'INR'
      );
      const meta = getCurrencyMeta(code);
      if (sysSetting || pubSetting) {
        return {
          ...meta,
          supportedCurrencies: Object.keys(CURRENCY_REGISTRY),
          allowMultiCurrency: Boolean(sysData.allowMultiCurrency ?? pubData.allowMultiCurrency),
          source: (sysData.currency) ? 'system_settings' : 'public_config',
          updatedAt: sysData.currencyUpdatedAt || pubData.updatedAt || null,
        };
      }
    }
  } catch (_) {}

  // 2. Secondary Standby: Firestore
  if (db) {
    try {
      const [sysDoc, pubDoc, subDoc, payDoc] = await Promise.allSettled([
        db.collection('data').doc('system_settings').get(),
        db.collection('data').doc('public_config').get(),
        db.collection('data').doc('subscriptions').get(),
        db.collection('settings').doc('payment_providers').get(),
      ]);
      const sysData = (sysDoc.status === 'fulfilled' && sysDoc.value.exists) ? (sysDoc.value.data() || {}) : {};
      const pubData = (pubDoc.status === 'fulfilled' && pubDoc.value.exists) ? (pubDoc.value.data() || {}) : {};
      const subData = (subDoc.status === 'fulfilled' && subDoc.value.exists) ? (subDoc.value.data() || {}) : {};
      const payData = (payDoc.status === 'fulfilled' && payDoc.value.exists) ? (payDoc.value.data() || {}) : {};

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
        source: (sysData.currency) ? 'system_settings' : (pubData.currency || pubData.subscriptions?.currency) ? 'public_config' : 'default',
        updatedAt: sysData.currencyUpdatedAt || pubData.updatedAt || null,
      };
    } catch (_error) {
      return { ...fallbackCurrencyConfig(), source: 'error-fallback' };
    }
  }

  return fallbackCurrencyConfig();
}

async function setPlatformCurrencyConfig({ db, admin, currency, allowMultiCurrency, actorUid, requestId }) {
  const normalized = normalizeCurrencyCode(currency);
  const meta = getCurrencyMeta(normalized);
  const repo = getRepository(db);

  let beforeState = { currency: 'INR', allowMultiCurrency: false };

  // 1. Primary: Save to MariaDB
  if (repo && typeof repo.saveSetting === 'function') {
    try {
      const [sysCurrent, pubCurrent] = await Promise.all([
        repo.getSetting('system_settings').catch(() => null),
        repo.getSetting('public_config').catch(() => null),
      ]);
      if (sysCurrent) beforeState = { currency: sysCurrent.currency || 'INR', allowMultiCurrency: Boolean(sysCurrent.allowMultiCurrency) };

      const sysUpdated = {
        ...(sysCurrent || {}),
        currency: normalized,
        currencyMeta: meta,
        allowMultiCurrency: Boolean(allowMultiCurrency),
        currencyUpdatedAt: new Date().toISOString(),
        currencyUpdatedBy: actorUid || 'system',
      };

      const pubUpdated = {
        ...(pubCurrent || {}),
        currency: normalized,
        currencySymbol: meta.symbol,
        allowMultiCurrency: Boolean(allowMultiCurrency),
      };

      await Promise.all([
        repo.saveSetting('system_settings', sysUpdated),
        repo.saveSetting('public_config', pubUpdated),
      ]);

      if (typeof repo.recordAdminAuditLog === 'function') {
        await repo.recordAdminAuditLog({
          actorUid: actorUid || 'system',
          action: 'PLATFORM_CURRENCY_UPDATED',
          category: 'platform.configuration',
          severity: 'HIGH',
          targetType: 'PLATFORM_CONFIG',
          targetId: 'currency',
          metadata: {
            before: beforeState,
            after: { currency: normalized, allowMultiCurrency: Boolean(allowMultiCurrency) }
          },
          requestId: requestId || null,
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('[PlatformCurrency] MySQL primary save error:', err.message);
    }
  }

  // 2. Secondary Standby: Replicate to Firestore asynchronously
  if (db && admin?.firestore?.FieldValue) {
    try {
      const sysRef = db.collection('data').doc('system_settings');
      const pubRef = db.collection('data').doc('public_config');
      const now = admin.firestore.FieldValue.serverTimestamp();
      const batch = db.batch();
      batch.set(sysRef, {
        currency: normalized,
        currencyMeta: meta,
        allowMultiCurrency: Boolean(allowMultiCurrency),
        currencyUpdatedAt: now,
        currencyUpdatedBy: actorUid || 'system',
      }, { merge: true });
      batch.set(pubRef, {
        currency: normalized,
        currencySymbol: meta.symbol,
        allowMultiCurrency: Boolean(allowMultiCurrency),
      }, { merge: true });
      batch.set(db.collection('security_audit_logs').doc(), {
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
      await batch.commit();
    } catch (_) {}
  }

  return {
    ...meta,
    supportedCurrencies: Object.keys(CURRENCY_REGISTRY),
    allowMultiCurrency: Boolean(allowMultiCurrency),
    source: 'system_settings',
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  CURRENCY_REGISTRY,
  normalizeCurrencyCode,
  getCurrencyMeta,
  formatCurrencyAmount,
  fallbackCurrencyConfig,
  getPlatformCurrencyConfig,
  setPlatformCurrencyConfig,
};
