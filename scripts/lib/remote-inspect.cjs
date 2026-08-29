const path = require('path');
const backendDir = '/home/u727965524/backend';
const { pool } = require(path.join(backendDir, 'database/mysql'));
const { migrationStatus } = require(path.join(backendDir, 'database/migrationRunner'));

async function main() {
  const [[vars]] = await pool.query('SELECT @@version as version, @@bind_address as bind_address, @@max_connections as max_connections, DATABASE() as db');
  const [tables] = await pool.query('SHOW TABLES');
  const status = await migrationStatus(pool);
  const [processlist] = await pool.query('SHOW PROCESSLIST');
  
  console.log(JSON.stringify({
    mariadbVariables: vars,
    totalTables: tables.length,
    activeConnections: processlist.length,
    migrations: status
  }, null, 2));
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
