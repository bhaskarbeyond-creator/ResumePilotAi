const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log('=== MYSQL TABLES & ROW COUNTS ON HOSTINGER ===');
  const tables = ['users', 'resumes', 'portfolios', 'covers', 'payment_orders', 'stats', 'system_settings', 'sync_outbox', 'sync_worker_state'];
  for (const t of tables) {
    try {
      const [r] = await pool.query('SELECT COUNT(*) as c FROM `' + t + '`');
      console.log(`${t}: ${r[0].c}`);
    } catch (e) {
      console.log(`${t} query error: ${e.message}`);
    }
  }

  console.log('\n=== MYSQL STATS TABLE ===');
  try {
    const [stats] = await pool.query('SELECT * FROM stats');
    console.log(JSON.stringify(stats, null, 2));
  } catch (e) {
    console.log('stats error:', e.message);
  }

  console.log('\n=== MYSQL PAYMENT ORDERS TABLE ===');
  try {
    const [orders] = await pool.query('SELECT id, user_id, amount, status, currency FROM payment_orders');
    console.log(JSON.stringify(orders, null, 2));
  } catch (e) {
    console.log('orders error:', e.message);
  }

  console.log('\n=== MYSQL SYSTEM SETTINGS TABLE ===');
  try {
    const [settings] = await pool.query('SELECT id, `key` FROM system_settings LIMIT 10');
    console.log(JSON.stringify(settings, null, 2));
  } catch (e) {
    console.log('settings error:', e.message);
  }

  process.exit(0);
})();
