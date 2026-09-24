const { execFileSync } = require('child_process');
const path = require('path');
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

console.log('Testing Admin Console View Queries on Server...');
const remoteScript = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
require("dotenv").config();
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getPool } = require("./database/mysql");
const { createTenantService } = require("./enterprise/tenantService");

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\\\n/g, "\\n")
};
const fbApp = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(fbApp);

async function checkAdminViews() {
  const pool = getPool();
  const tenantService = createTenantService({ pool, admin: { auth: () => auth } });

  // 1. Check all tenants returned by tenantService
  const tenants = await tenantService.listTenants({ limit: 100 });
  console.log("TENANTS COUNT:", (tenants.items || tenants).length);
  console.log("TENANTS:", JSON.stringify(tenants.items || tenants, null, 2));

  // 2. Check all users in Firebase Auth
  const fbUsers = await auth.listUsers(100);
  console.log("FIREBASE USERS COUNT:", fbUsers.users.length);
  console.log("USERS:", fbUsers.users.map(u => ({ uid: u.uid, email: u.email, role: u.customClaims?.role })));

  // 3. Check MariaDB users
  const [dbUsers] = await pool.query("SELECT id, email, role, membership, suspended FROM users;");
  console.log("MARIADB USERS COUNT:", dbUsers.length);
  console.log("DB USERS:", JSON.stringify(dbUsers, null, 2));

  process.exit(0);
}
checkAdminViews().catch(e => { console.error(e); process.exit(1); });
'
`;

const res = runSsh(remoteScript);
console.log(res);
