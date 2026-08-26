import { getPool } from '../backend/database/mysql.js';

async function inspectDb() {
  const pool = getPool();
  const [vRows] = await pool.query('SELECT VERSION() as version, DATABASE() as db, USER() as user, @@port as port, @@hostname as host');
  const [eRows] = await pool.query("SELECT engine, support FROM information_schema.engines WHERE engine = 'InnoDB'");
  const [tRows] = await pool.query('SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = DATABASE()');
  const [maxConn] = await pool.query("SHOW VARIABLES LIKE 'max_connections'");
  const [waitTimeout] = await pool.query("SHOW VARIABLES LIKE 'wait_timeout'");
  
  console.log('--- Live MariaDB Infrastructure Details ---');
  console.log('Version:', vRows[0].version);
  console.log('Database:', vRows[0].db);
  console.log('User:', vRows[0].user);
  console.log('Host/Port:', `${vRows[0].host}:${vRows[0].port}`);
  console.log('Engine Support:', eRows[0]);
  console.log('Active Table Count:', tRows[0].table_count);
  console.log('Max Connections:', maxConn[0]?.Value);
  console.log('Wait Timeout:', waitTimeout[0]?.Value);
  process.exit(0);
}

inspectDb().catch((err) => {
  console.error('DB inspection error:', err);
  process.exit(1);
});
