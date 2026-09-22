'use strict';

const { getPool } = require('../backend/database/mysql');

async function main() {
  const pool = getPool();
  try {
    const [rows] = await pool.query('SELECT category, revision, data FROM system_settings');
    console.log('Current system_settings categories:', rows.map(r => ({ category: r.category, revision: r.revision })));
    for (const row of rows) {
      const dataStr = typeof row.data === 'string' ? row.data : JSON.stringify(row.data);
      if (dataStr.includes('ResumePilot')) {
        console.log(`[Category ${row.category}] contains ResumePilot!`);
        // Replace ResumePilot AI and ResumePilot with IME365
        let updated = dataStr.replace(/ResumePilot AI/g, 'IME365').replace(/ResumePilot/g, 'IME365');
        const parsed = JSON.parse(updated);
        await pool.query('UPDATE system_settings SET data = ?, revision = revision + 1, updated_at = UTC_TIMESTAMP() WHERE category = ?', [JSON.stringify(parsed), row.category]);
        console.log(`[Category ${row.category}] updated successfully to IME365.`);
      }
    }

    // Verify
    const [updatedRows] = await pool.query('SELECT category, revision, data FROM system_settings');
    for (const r of updatedRows) {
      const str = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      if (str.includes('ResumePilot')) {
        console.error(`WARNING: [Category ${r.category}] still contains ResumePilot!`);
      } else {
        console.log(`[Category ${r.category}] Clean: 0 occurrences of ResumePilot.`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Migration script failed:', err);
  process.exit(1);
});
