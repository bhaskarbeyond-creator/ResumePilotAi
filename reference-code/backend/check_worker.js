const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

(async () => {
  const pool = mysql.createPool({
    host: '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [rows] = await pool.query('SELECT * FROM sync_worker_state');
  console.log('Sync Worker Live Heartbeat:', JSON.stringify(rows, null, 2));
  process.exit(0);
})();
