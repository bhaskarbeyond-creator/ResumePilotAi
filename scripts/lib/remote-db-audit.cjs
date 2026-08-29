const path = require('path');
const backendDir = '/home/u727965524/backend';
const { pool } = require(path.join(backendDir, 'database/mysql'));

async function main() {
  // 1. Engine & Configuration Variables
  const [variables] = await pool.query(`
    SHOW VARIABLES WHERE Variable_name IN (
      'version', 'version_comment', 'innodb_version',
      'innodb_buffer_pool_size', 'innodb_log_file_size', 'innodb_flush_log_at_trx_commit',
      'max_connections', 'max_user_connections', 'thread_cache_size',
      'table_open_cache', 'table_definition_cache',
      'transaction_isolation', 'tx_isolation',
      'slow_query_log', 'long_query_time', 'log_queries_not_using_indexes',
      'log_bin', 'binlog_format', 'expire_logs_days', 'binlog_expire_logs_seconds',
      'character_set_server', 'collation_server', 'character_set_database'
    )
  `);
  
  // 2. Status metrics
  const [status] = await pool.query(`
    SHOW GLOBAL STATUS WHERE Variable_name IN (
      'Uptime', 'Threads_connected', 'Threads_running', 'Threads_created', 'Threads_cached',
      'Connections', 'Max_used_connections', 'Aborted_connects', 'Aborted_clients',
      'Slow_queries', 'Questions', 'Queries', 'Com_select', 'Com_insert', 'Com_update', 'Com_delete',
      'Innodb_buffer_pool_reads', 'Innodb_buffer_pool_read_requests',
      'Innodb_row_lock_waits', 'Innodb_row_lock_time_avg', 'Innodb_deadlocks',
      'Created_tmp_disk_tables', 'Created_tmp_tables'
    )
  `);

  // 3. Database Table Sizes & Rows
  const [tableSizes] = await pool.query(`
    SELECT 
      table_name AS tableName,
      engine,
      table_rows AS estimatedRows,
      ROUND((data_length + index_length) / 1024 / 1024, 3) AS totalSizeMB,
      ROUND(data_length / 1024 / 1024, 3) AS dataSizeMB,
      ROUND(index_length / 1024 / 1024, 3) AS indexSizeMB,
      table_collation AS collation
    FROM information_schema.TABLES
    WHERE table_schema = DATABASE()
    ORDER BY (data_length + index_length) DESC
  `);

  // 4. Index Details for Core Domain Tables
  const [indexes] = await pool.query(`
    SELECT 
      table_name AS tableName,
      index_name AS indexName,
      non_unique AS nonUnique,
      seq_in_index AS seqInIndex,
      column_name AS columnName,
      cardinality,
      nullable,
      index_type AS indexType
    FROM information_schema.STATISTICS
    WHERE table_schema = DATABASE()
      AND table_name IN (
        'users', 'resumes', 'public_resumes', 'covers', 'portfolios',
        'jobs', 'companies', 'applications', 'job_tracker',
        'payment_orders', 'payment_webhook_events', 'invoices',
        'notification_outbox', 'enterprise_outbox', 'enterprise_tenants',
        'system_settings', 'blog'
      )
    ORDER BY table_name, index_name, seq_in_index
  `);

  // 5. Foreign Key & Constraints Audit
  const [constraints] = await pool.query(`
    SELECT 
      table_name AS tableName,
      constraint_name AS constraintName,
      constraint_type AS constraintType
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE table_schema = DATABASE()
    ORDER BY table_name, constraint_name
  `);

  console.log(JSON.stringify({
    variables: Object.fromEntries(variables.map(r => [r.Variable_name, r.Value])),
    status: Object.fromEntries(status.map(r => [r.Variable_name, r.Value])),
    tableCount: tableSizes.length,
    tableSizes: tableSizes.slice(0, 25),
    indexes,
    constraintsCount: constraints.length,
    constraints: constraints.slice(0, 30)
  }, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
