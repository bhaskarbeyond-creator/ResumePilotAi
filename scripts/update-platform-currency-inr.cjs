'use strict';

const { getPool } = require('../backend/database/mysql');
const { getPlatformCurrencyConfig } = require('../backend/services/platformCurrency');

async function updateCurrencyToINR() {
  const pool = getPool();
  const [rows] = await pool.query("SELECT category, data, revision FROM system_settings WHERE category IN ('system_settings', 'public_config')");
  for (const r of rows) {
    const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    d.currency = 'INR';
    d.currencySymbol = '₹';
    if (d.currencyMeta) {
      d.currencyMeta = { code: 'INR', symbol: '₹', name: 'Indian Rupee', subunit: 'Paise', decimals: 2, defaultLocale: 'en-IN' };
    }
    if (d.subscriptions) {
      d.subscriptions.currency = 'INR';
      d.subscriptions.currencySymbol = '₹';
    }
    await pool.query('UPDATE system_settings SET data = ?, revision = revision + 1, updated_at = NOW() WHERE category = ?', [JSON.stringify(d), r.category]);
  }

  // Also update active jobs salary currency to INR
  const [jobUpdate] = await pool.query("UPDATE jobs SET salary_currency = 'INR'");
  console.log('✅ Updated jobs table salary_currency to INR, rows affected:', jobUpdate.affectedRows);

  const config = await getPlatformCurrencyConfig();
  console.log('✅ Authoritative MariaDB platform currency:', config);
  process.exit(0);
}

updateCurrencyToINR().catch((err) => {
  console.error('❌ Error updating currency:', err);
  process.exit(1);
});
