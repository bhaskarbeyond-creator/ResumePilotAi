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

const crypto = require('crypto');
const { getPool } = require('../database/mysql');


function asCurrencyStorageError(error) {
  if (error?.status) return error;
  error.code = error.code || 'CURRENCY_STORAGE_UNAVAILABLE';
  error.status = 503;
  return error;
}

async function getPlatformCurrencyConfig() {
  try {
  const [rows] = await getPool().query(
    "SELECT category, data, revision, updated_at FROM system_settings WHERE category IN ('system_settings','public_config')"
  );
  const byCategory = Object.fromEntries(rows.map(row => [row.category, {
    data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {}),
    revision: Number(row.revision || 0), updatedAt: row.updated_at,
  }]));
  const system = byCategory.system_settings?.data || {};
  const publicConfig = byCategory.public_config?.data || {};
  const explicit = system.currency || system.defaultCurrency || publicConfig.currency
    || publicConfig.subscriptions?.currency || publicConfig.currencyMeta?.code;
  if (!explicit) {
    throw Object.assign(new Error('Platform currency is not initialized in MariaDB'), {
      code: 'CURRENCY_NOT_INITIALIZED', status: 503,
    });
  }
  const code = normalizeCurrencyCode(explicit);
  return {
    ...getCurrencyMeta(code),
    supportedCurrencies: Object.keys(CURRENCY_REGISTRY),
    allowMultiCurrency: Boolean(system.allowMultiCurrency ?? publicConfig.allowMultiCurrency),
    source: system.currency ? 'mariadb-system-settings' : 'mariadb-public-config',
    updatedAt: system.currencyUpdatedAt || byCategory.system_settings?.updatedAt || byCategory.public_config?.updatedAt || null,
    revision: Number(system.currencyRevision || 0),
  };

  } catch (error) {
    throw asCurrencyStorageError(error);
  }
}

async function setPlatformCurrencyConfig({ currency, allowMultiCurrency, actorUid, requestId, expectedRevision }) {
  const requested = String(currency || '').trim().toUpperCase();
  if (!CURRENCY_REGISTRY[requested]) {
    throw Object.assign(new Error('Unsupported currency code'), { code: 'UNSUPPORTED_CURRENCY', status: 400 });
  }
  if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) < 0) {
    throw Object.assign(new Error('expectedRevision is required'), { code: 'CURRENCY_REVISION_REQUIRED', status: 400 });
  }
  const meta = getCurrencyMeta(requested);
  let connection;
  let nextRevision;
  try {
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(
      "SELECT category, data, revision FROM system_settings WHERE category IN ('system_settings','public_config') FOR UPDATE"
    );
    const settings = Object.fromEntries(rows.map(row => [row.category,
      typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {})]));
    const system = settings.system_settings || {};
    const publicConfig = settings.public_config || {};
    const currentRevision = Number(system.currencyRevision || 0);
    if (Number(expectedRevision) !== currentRevision) {
      throw Object.assign(new Error('Currency settings changed after this panel loaded. Refresh before saving.'), { code: 'CURRENCY_CONFLICT', status: 409 });
    }
    nextRevision = currentRevision + 1;
    const updatedAt = new Date().toISOString();
    const nextSystem = {
      ...system, currency: requested, currencyMeta: meta,
      allowMultiCurrency: allowMultiCurrency === true, currencyRevision: nextRevision,
      currencyUpdatedAt: updatedAt, currencyUpdatedBy: actorUid || 'system',
    };
    const nextPublic = {
      ...publicConfig, currency: requested, currencySymbol: meta.symbol,
      allowMultiCurrency: allowMultiCurrency === true,
    };
    for (const [category, data] of [['system_settings', nextSystem], ['public_config', nextPublic]]) {
      await connection.query(
        `INSERT INTO system_settings (category, data, revision, updated_at) VALUES (?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE data = VALUES(data), revision = revision + 1, updated_at = NOW()`,
        [category, JSON.stringify(data)]
      );
    }
    await connection.query(
      `INSERT INTO admin_audit_logs
       (id, actor_uid, actor_role, action, category, severity, outcome, method, pathname,
        status_code, resource_type, resource_id, metadata, request_id, created_at)
       VALUES (?, ?, 'SUPER_ADMIN', 'PLATFORM_CURRENCY_UPDATED', 'platform.configuration',
               'HIGH', 'SUCCESS', 'PUT', '/api/admin/platform/currency', 200,
               'platform_configuration', 'currency', ?, ?, NOW())`,
      [crypto.randomUUID(), actorUid || 'system', JSON.stringify({
        before: { currency: system.currency || 'INR', allowMultiCurrency: Boolean(system.allowMultiCurrency) },
        after: { currency: requested, allowMultiCurrency: allowMultiCurrency === true }, revision: nextRevision,
      }), requestId || null]
    );
    await connection.commit();
    return {
      ...meta, supportedCurrencies: Object.keys(CURRENCY_REGISTRY),
      allowMultiCurrency: allowMultiCurrency === true,
      source: 'mariadb-system-settings', updatedAt, revision: nextRevision,
    };
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackError) { console.error('[Currency rollback failed]', rollbackError.message); }
    }
    throw asCurrencyStorageError(error);
  } finally {
    connection?.release();
  }
}

module.exports = {
  CURRENCY_REGISTRY,
  normalizeCurrencyCode,
  getCurrencyMeta,
  formatCurrencyAmount,
  getPlatformCurrencyConfig,
  setPlatformCurrencyConfig,
};
