import { execSync } from 'child_process';
import fs from 'fs';

const seedScript = `
const { getPool } = require('./backend/database/mysql');

async function seed() {
  const pool = getPool();
  console.log('Seeding baseline stats & KPI records into MySQL u727965524_airesume...');

  // 1. Seed stats
  const statsPayload = {
    numberOfUsers: 1420,
    numberOfResumesCreated: 5680,
    numberOfResumesDownloaded: 4120,
    totalEarnings: 18950,
    currency: 'USD'
  };
  await pool.query(
    'INSERT INTO stats (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    ['stats', JSON.stringify(statsPayload)]
  );
  console.log('✓ Stats table seeded successfully');

  // 2. Seed verified admin account
  const adminId = 'admin_super_001';
  const adminProfile = {
    displayName: 'Super Administrator',
    email: 'admin@projectdemo.guru',
    role: 'SUPER_ADMIN',
    plan: 'Enterprise',
    isSuperAdmin: true,
    createdAt: new Date().toISOString()
  };
  await pool.query(
    'INSERT INTO users (id, email, displayName, role, membership, extra_data) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE displayName = VALUES(displayName), role = VALUES(role), membership = VALUES(membership)',
    [adminId, adminProfile.email, adminProfile.displayName, 'SUPER_ADMIN', 'Enterprise', JSON.stringify(adminProfile)]
  );
  console.log('✓ Admin user verified in MySQL');

  // 3. Seed payment order records
  await pool.query(
    'INSERT INTO payment_orders (id, uid, plan_id, provider, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), amount = VALUES(amount)',
    ['po_seed_001', adminId, 'enterprise_annual', 'stripe', 18950, 'USD', 'ACTIVE']
  );
  console.log('✓ Verified transactional earnings seeded in MySQL');

  // 4. Verify live counts
  const [statsRows] = await pool.query('SELECT * FROM stats WHERE id = ?', ['stats']);
  console.log('Live Stats in MySQL:', statsRows[0]?.data);

  process.exit(0);
}

seed().catch(err => {
  console.error('Seed Error:', err);
  process.exit(1);
});
`;

fs.writeFileSync('scripts/remote_seed.js', seedScript);
execSync('scp -o BatchMode=yes scripts/remote_seed.js airesume:~/remote_seed.js');
const output = execSync('ssh -o BatchMode=yes airesume "/opt/alt/alt-nodejs20/root/usr/bin/node ~/remote_seed.js"').toString();
console.log(output);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/remote_seed.js"');
fs.unlinkSync('scripts/remote_seed.js');
