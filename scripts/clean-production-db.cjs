const { execFileSync } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: 'backend/.env' });

const SSH_KEY = path.join(__dirname, '..', 'dev_key');

function runSsh(cmd) {
  return execFileSync('ssh', [
    '-i', SSH_KEY,
    '-p', '65002',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'PasswordAuthentication=no',
    'u727965524@82.112.232.112',
    cmd
  ], { encoding: 'utf8' });
}

async function main() {
  console.log('=== STEP 1: Taking Server-Side Full Database Backup ===');
  const timestamp = Date.now();
  const backupFile = `/home/u727965524/deploy_backups/backup-pre-ime365-${timestamp}.sql`;

  runSsh(`mkdir -p /home/u727965524/deploy_backups && mysqldump -u u727965524_airesume -p"\$(grep DB_PASSWORD /home/u727965524/backend/.env | cut -d'=' -f2 | tr -d '\"')" u727965524_airesume > ${backupFile}`);
  const backupCheck = runSsh(`ls -lh ${backupFile}`);
  console.log('Backup verified on server:');
  console.log(backupCheck.trim());

  console.log('\n=== STEP 2: Cleaning Database & Preserving Core Schema ===');
  const cleanScript = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
const { pool } = require("./database/mysql");

async function clean() {
  const connection = await pool.getConnection();
  try {
    console.log("Starting database cleansing transaction...");
    await connection.query("SET FOREIGN_KEY_CHECKS = 0;");

    // Tables to truncate (user-generated test/demo data)
    const tablesToTruncate = [
      "resumes",
      "public_resumes",
      "portfolios",
      "payment_orders",
      "coupons",
      "email_logs",
      "admin_audit_logs",
      "security_audit_logs",
      "notification_outbox",
      "sync_outbox",
      "ai_usage",
      "enterprise_audit_events"
    ];

    for (const table of tablesToTruncate) {
      try {
        await connection.query("TRUNCATE TABLE \`" + table + "\`;");
        console.log("  ✓ Truncated:", table);
      } catch (err) {
        console.log("  - Notice on", table, ":", err.message);
      }
    }

    // Clean users table - retain ONLY bhaskar.beyond@gmail.com as SUPER_ADMIN
    console.log("Cleaning users table...");
    await connection.query("DELETE FROM users WHERE email != ?;", ["bhaskar.beyond@gmail.com"]);
    
    // Check if bhaskar.beyond@gmail.com exists
    const [existing] = await connection.query("SELECT * FROM users WHERE email = ?;", ["bhaskar.beyond@gmail.com"]);
    if (existing.length > 0) {
      await connection.query(
        "UPDATE users SET role = ?, suspended = FALSE, membership = ? WHERE email = ?;",
        ["SUPER_ADMIN", "Enterprise", "bhaskar.beyond@gmail.com"]
      );
      console.log("  ✓ Updated bhaskar.beyond@gmail.com to SUPER_ADMIN (UID: " + existing[0].id + ")");
    } else {
      const superAdminUid = "OhZdiSIFL7ePA1TMkfu9bnR935D3";
      await connection.query(
        "INSERT INTO users (id, email, displayName, role, suspended, membership, created_at, updated_at) VALUES (?, ?, ?, ?, FALSE, ?, NOW(), NOW());",
        [superAdminUid, "bhaskar.beyond@gmail.com", "Bhaskar SuperAdmin", "SUPER_ADMIN", "Enterprise"]
      );
      console.log("  ✓ Provisioned bhaskar.beyond@gmail.com as SUPER_ADMIN in MariaDB");
    }

    // Reset stats counters
    try {
      await connection.query("UPDATE stats SET total_resumes = 0, total_downloads = 0, total_views = 0 WHERE id = 1;");
      console.log("  ✓ Reset platform stats counters");
    } catch (_) {}

    await connection.query("SET FOREIGN_KEY_CHECKS = 1;");
    console.log("\\nDatabase cleansing successfully completed!");

    // Verification check
    const [users] = await connection.query("SELECT id, email, role, suspended, membership FROM users;");
    console.log("\\nUsers remaining in database:", JSON.stringify(users, null, 2));

    const [resumes] = await connection.query("SELECT COUNT(*) as count FROM resumes;");
    console.log("Resumes remaining in database:", resumes[0].count);

    process.exit(0);
  } catch (err) {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1;");
    console.error("Database clean error:", err);
    process.exit(1);
  } finally {
    connection.release();
  }
}
clean();
'
`;

  const cleanResult = runSsh(cleanScript);
  console.log(cleanResult);

  console.log('\n=== STEP 3: Verifying & Setting Firebase Auth SuperAdmin Claims ===');
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  };
  const app = initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth(app);

  const fbUser = await auth.getUserByEmail('bhaskar.beyond@gmail.com');
  await auth.setCustomUserClaims(fbUser.uid, {
    ...(fbUser.customClaims || {}),
    role: 'SUPER_ADMIN',
    email: 'bhaskar.beyond@gmail.com'
  });
  const updatedUser = await auth.getUser(fbUser.uid);
  console.log('Firebase Auth Super Admin Claims Confirmed:');
  console.log('  UID:', updatedUser.uid);
  console.log('  Email:', updatedUser.email);
  console.log('  Role Claim:', updatedUser.customClaims.role);
}

main().catch(err => {
  console.error('Fatal error during clean:', err);
  process.exit(1);
});
