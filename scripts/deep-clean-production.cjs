const { execFileSync } = require('child_process');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const dotenv = require('dotenv');
dotenv.config({ path: 'backend/.env' });

const SSH_KEY = path.join(__dirname, '..', 'dev_key');
const SUPERADMIN_EMAIL = 'bhaskar.beyond@gmail.com';
const SUPERADMIN_UID = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';

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

async function cleanFirebaseAuth() {
  console.log('======================================================');
  console.log(' STEP 1: Purging All Test Users From Firebase Auth   ');
  console.log('======================================================\n');

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  };
  const app = initializeApp({ credential: cert(serviceAccount) }, 'cleaner-' + Date.now());
  const auth = getAuth(app);

  let pageToken;
  let allUsers = [];
  do {
    const listResult = await auth.listUsers(1000, pageToken);
    allUsers = allUsers.concat(listResult.users);
    pageToken = listResult.pageToken;
  } while (pageToken);

  console.log(`Found ${allUsers.length} total users in Firebase Authentication directory.`);

  const uidsToDelete = allUsers
    .filter(u => u.uid !== SUPERADMIN_UID && u.email?.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase())
    .map(u => u.uid);

  console.log(`Identified ${uidsToDelete.length} test users to delete.`);

  // Batch delete in chunks of 500
  for (let i = 0; i < uidsToDelete.length; i += 500) {
    const chunk = uidsToDelete.slice(i, i + 500);
    const deleteResult = await auth.deleteUsers(chunk);
    console.log(`  ✓ Deleted chunk of ${deleteResult.successCount} users (failures: ${deleteResult.failureCount})`);
  }

  // Ensure bhaskar.beyond@gmail.com has proper claims and verified status
  const superAdmin = await auth.getUser(SUPERADMIN_UID);
  await auth.setCustomUserClaims(SUPERADMIN_UID, {
    role: 'SUPER_ADMIN',
    email: SUPERADMIN_EMAIL
  });
  await auth.updateUser(SUPERADMIN_UID, {
    emailVerified: true,
    disabled: false,
    displayName: 'Bhaskar Beyond (Super Admin)'
  });

  const verifiedUsers = await auth.listUsers(100);
  console.log(`\nRemaining users in Firebase Auth: ${verifiedUsers.users.length}`);
  verifiedUsers.users.forEach(u => {
    console.log(`  👉 UID: ${u.uid} | Email: ${u.email} | Role: ${u.customClaims?.role} | Verified: ${u.emailVerified}`);
  });

  if (verifiedUsers.users.length !== 1 || verifiedUsers.users[0].email !== SUPERADMIN_EMAIL) {
    throw new Error('Firebase Auth cleansing validation failed!');
  }
  console.log('\n✓ Firebase Auth is now 100% clean with ONLY the Super Admin!');
}

async function cleanMariaDb() {
  console.log('\n======================================================');
  console.log(' STEP 2: Purging All Test Data & Tenants in MariaDB   ');
  console.log('======================================================\n');

  const remoteScript = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
const { pool } = require("./database/mysql");

async function clean() {
  const connection = await pool.getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0;");

    console.log("1. Cleaning enterprise tables...");
    // Keep only Superadmin tenant or clean tenant table
    await connection.query("DELETE FROM enterprise_tenants WHERE legacyOwnerUid != ? AND id NOT IN (SELECT tenantId FROM enterprise_workspace_memberships WHERE principalId = ?);", ["${SUPERADMIN_UID}", "${SUPERADMIN_UID}"]);
    
    // Update the single remaining tenant to have clean IME365 branding
    await connection.query("UPDATE enterprise_tenants SET displayName = ?, slug = ?, lifecycleState = ? WHERE legacyOwnerUid = ?;", ["IME365 Enterprise Organization", "ime365-org", "ACTIVE", "${SUPERADMIN_UID}"]);

    const [tenants] = await connection.query("SELECT id FROM enterprise_tenants;");
    const activeTenantIds = tenants.map(t => t.id);

    if (activeTenantIds.length > 0) {
      await connection.query("DELETE FROM enterprise_workspaces WHERE tenantId NOT IN (?);", [activeTenantIds]);
      await connection.query("DELETE FROM enterprise_workspace_memberships WHERE tenantId NOT IN (?);", [activeTenantIds]);
      await connection.query("DELETE FROM enterprise_memberships WHERE tenantId NOT IN (?);", [activeTenantIds]);
      await connection.query("DELETE FROM enterprise_tenant_configurations WHERE tenantId NOT IN (?);", [activeTenantIds]);
      await connection.query("DELETE FROM enterprise_principal_tenants WHERE principalId != ?;", ["${SUPERADMIN_UID}"]);
      await connection.query("UPDATE enterprise_workspaces SET name = ? WHERE isDefault = 1 AND tenantId = ?;", ["Main Workspace", activeTenantIds[0]]);
    } else {
      await connection.query("TRUNCATE TABLE enterprise_workspaces;");
      await connection.query("TRUNCATE TABLE enterprise_workspace_memberships;");
      await connection.query("TRUNCATE TABLE enterprise_memberships;");
      await connection.query("TRUNCATE TABLE enterprise_principal_tenants;");
      await connection.query("TRUNCATE TABLE enterprise_tenant_configurations;");
    }

    await connection.query("TRUNCATE TABLE enterprise_quota_buckets;");
    await connection.query("TRUNCATE TABLE enterprise_observability_rollups;");
    await connection.query("TRUNCATE TABLE enterprise_audit_events;");

    console.log("2. Cleaning application tables...");
    await connection.query("TRUNCATE TABLE resumes;");
    await connection.query("TRUNCATE TABLE public_resumes;");
    await connection.query("TRUNCATE TABLE portfolios;");
    await connection.query("TRUNCATE TABLE payment_orders;");
    await connection.query("TRUNCATE TABLE coupons;");
    await connection.query("TRUNCATE TABLE email_logs;");
    await connection.query("TRUNCATE TABLE admin_audit_logs;");
    await connection.query("TRUNCATE TABLE security_audit_logs;");
    await connection.query("TRUNCATE TABLE notification_outbox;");
    await connection.query("TRUNCATE TABLE sync_outbox;");
    await connection.query("TRUNCATE TABLE ai_usage;");
    await connection.query("TRUNCATE TABLE platform_announcements;");

    console.log("3. Ensuring only bhaskar.beyond@gmail.com exists in users table...");
    await connection.query("DELETE FROM users WHERE email != ?;", ["${SUPERADMIN_EMAIL}"]);
    await connection.query(
      "UPDATE users SET role = ?, suspended = 0, membership = ?, displayName = ? WHERE email = ?;",
      ["SUPER_ADMIN", "Enterprise", "Bhaskar Beyond", "${SUPERADMIN_EMAIL}"]
    );

    // Reset stats
    try {
      await connection.query("UPDATE stats SET total_resumes = 0, total_downloads = 0, total_views = 0 WHERE id = 1;");
    } catch (_) {}

    await connection.query("SET FOREIGN_KEY_CHECKS = 1;");
    console.log("Database transaction completed successfully!");

    // Verification queries
    console.log("\\n=== VERIFICATION AUDIT ===");
    const [u] = await connection.query("SELECT id, email, role, membership, suspended FROM users;");
    console.log("USERS in MariaDB (" + u.length + "):", JSON.stringify(u, null, 2));

    const [t] = await connection.query("SELECT id, slug, displayName, lifecycleState, legacyOwnerUid FROM enterprise_tenants;");
    console.log("TENANTS in MariaDB (" + t.length + "):", JSON.stringify(t, null, 2));

    const [w] = await connection.query("SELECT id, name, tenantId FROM enterprise_workspaces;");
    console.log("WORKSPACES in MariaDB (" + w.length + "):", JSON.stringify(w, null, 2));

    const [r] = await connection.query("SELECT COUNT(*) as c FROM resumes;");
    console.log("RESUMES COUNT:", r[0].c);

    const [pa] = await connection.query("SELECT COUNT(*) as c FROM platform_announcements;");
    console.log("ANNOUNCEMENTS COUNT:", pa[0].c);

    process.exit(0);
  } catch (err) {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1;");
    console.error("Cleanup error:", err);
    process.exit(1);
  } finally {
    connection.release();
  }
}

clean();
'
`;

  const dbRes = runSsh(remoteScript);
  console.log(dbRes);
}

async function main() {
  await cleanFirebaseAuth();
  await cleanMariaDb();
  console.log('\n======================================================');
  console.log('🎉 PLATFORM CLEANSING COMPLETED WITH 100% SUCCESS!   ');
  console.log('======================================================');
}

main().catch(err => {
  console.error('Fatal error during cleanup:', err);
  process.exit(1);
});
