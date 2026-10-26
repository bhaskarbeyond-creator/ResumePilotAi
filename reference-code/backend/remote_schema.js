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

  console.log('=== MYSQL SCHEMA DETAILS ===');
  for (const t of ['payment_orders', 'system_settings', 'stats', 'users']) {
    try {
      const [cols] = await pool.query('DESCRIBE `' + t + '`');
      console.log(`\nTable ${t}:`);
      console.log(cols.map(c => `${c.Field} (${c.Type})`).join(', '));
    } catch (e) {
      console.log(`${t} error: ${e.message}`);
    }
  }

  process.exit(0);
})();
