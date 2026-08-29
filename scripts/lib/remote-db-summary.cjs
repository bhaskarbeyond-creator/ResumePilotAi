const path = require('path');
const backendDir = '/home/u727965524/backend';
const { pool } = require(path.join(backendDir, 'database/mysql'));

async function main() {
  const [vars] = await pool.query(`
    SHOW VARIABLES WHERE Variable_name IN (
      'version', 'version_comment', 'innodb_buffer_pool_size', 'innodb_log_file_size',
      'max_connections', 'transaction_isolation', 'slow_query_log', 'long_query_time',
      'log_bin', 'binlog_format', 'character_set_server', 'collation_server'
    )
  `);
  
  const [status] = await pool.query(`
    SHOW GLOBAL STATUS WHERE Variable_name IN (
      'Uptime', 'Threads_connected', 'Threads_running', 'Max_used_connections',
      'Slow_queries', 'Questions', 'Queries', 'Innodb_row_lock_waits', 'Innodb_deadlocks'
    )
  `);

  console.log('=== MARIADB VARIABLES ===');
  console.table(vars);
  console.log('=== MARIADB STATUS ===');
  console.table(status);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
