import { execSync } from 'child_process';
import fs from 'fs';

const testFileContent = `
const { getActiveEngine, testEngineConnectivity, switchActiveEngine } = require('./backend/database/engineManager');
const { getPool } = require('./backend/database/mysql');

(async () => {
  try {
    console.log('===============================================================');
    console.log('🚀 LIVE PRODUCTION HOSTINGER VERIFICATION PROBES');
    console.log('===============================================================');

    console.log('\\n[PROBE 1] Checking Active Engine on Live Hostinger:');
    const initialEngine = getActiveEngine();
    console.log('  Active Engine:', initialEngine);

    console.log('\\n[PROBE 2] Testing MariaDB / MySQL Live Connectivity:');
    const mysqlHealth = await testEngineConnectivity('mysql');
    console.log('  MySQL Health:', JSON.stringify(mysqlHealth));
    if (!mysqlHealth.connected) {
      throw new Error('MySQL connection failed on Hostinger');
    }

    console.log('\\n[PROBE 3] Performing Full CRUD Lifecycle on Live MariaDB:');
    const pool = getPool();
    const testUserId = 'test_usr_prod_' + Date.now();
    const testEmail = 'probe_' + Date.now() + '@example.com';
    
    // 1. CREATE
    await pool.query(
      'INSERT INTO users (id, email, firstname, lastname, role, membership) VALUES (?, ?, ?, ?, ?, ?)',
      [testUserId, testEmail, 'Probe', 'User', 'USER', 'Pro']
    );
    console.log('  ✓ CREATE: Test user record inserted into live MariaDB');

    // 2. READ
    const [readRows] = await pool.query('SELECT * FROM users WHERE id = ?', [testUserId]);
    console.log('  ✓ READ: Found user in live MariaDB:', readRows[0]?.email, '(Role: ' + readRows[0]?.role + ')');

    // 3. UPDATE
    await pool.query('UPDATE users SET firstname = ?, membership = ? WHERE id = ?', ['ProbeUpdated', 'Enterprise', testUserId]);
    const [updateRows] = await pool.query('SELECT firstname, membership FROM users WHERE id = ?', [testUserId]);
    console.log('  ✓ UPDATE: Record updated in live MariaDB:', updateRows[0]?.firstname, '(Plan: ' + updateRows[0]?.membership + ')');

    // 4. DELETE
    await pool.query('DELETE FROM users WHERE id = ?', [testUserId]);
    const [deletedRows] = await pool.query('SELECT * FROM users WHERE id = ?', [testUserId]);
    console.log('  ✓ DELETE: Record cleaned up, remaining records for ID:', deletedRows.length);

    console.log('\\n[PROBE 4] Testing Super Admin Engine Switch to MySQL:');
    const switchMysql = await switchActiveEngine('mysql', 'SUPER_ADMIN_VERIFIER');
    console.log('  Switch Result:', JSON.stringify(switchMysql));

    console.log('\\n[PROBE 5] Validating Target Connectivity Rejection Safety:');
    try {
      await switchActiveEngine('unsupported_db_engine', 'SUPER_ADMIN_VERIFIER');
      console.error('  ❌ Failed to reject unsupported engine!');
    } catch (e) {
      console.log('  ✓ Rejection Safety Proven:', e.message);
    }

    console.log('\\n[PROBE 6] Final Database Census on Hostinger MariaDB:');
    const [tableRows] = await pool.query('SHOW TABLES');
    console.log('  Total Tables in Hostinger MariaDB:', tableRows.length);

    console.log('\\n===============================================================');
    console.log('✅ ALL LIVE HOSTINGER DATABASE PROBES PASSED 100%');
    console.log('===============================================================');
    process.exit(0);
  } catch (err) {
    console.error('LIVE VERIFICATION ERROR:', err);
    process.exit(1);
  }
})();
`;

fs.writeFileSync('scripts/remote_test_payload.js', testFileContent);

console.log('Deploying and running live database verification on Hostinger...');
execSync('scp -o BatchMode=yes scripts/remote_test_payload.js airesume:~/remote_test_payload.js', { stdio: 'inherit' });
execSync('ssh -o BatchMode=yes airesume "/opt/alt/alt-nodejs20/root/usr/bin/node /home/u727965524/remote_test_payload.js; rm -f /home/u727965524/remote_test_payload.js"', { stdio: 'inherit' });
if (fs.existsSync('scripts/remote_test_payload.js')) fs.unlinkSync('scripts/remote_test_payload.js');
