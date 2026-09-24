const { execFileSync } = require('child_process');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
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
  console.log('=== 1. CHECKING FIREBASE AUTH DIRECTORY ===');
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  };
  const app = initializeApp({ credential: cert(serviceAccount) }, 'inspect-app');
  const auth = getAuth(app);

  let pageToken;
  let fbUsers = [];
  do {
    const listResult = await auth.listUsers(1000, pageToken);
    fbUsers = fbUsers.concat(listResult.users);
    pageToken = listResult.pageToken;
  } while (pageToken);

  console.log(`Total Firebase Auth users: ${fbUsers.length}`);
  fbUsers.forEach(u => {
    console.log(`  - ${u.email || '(no email)'} [UID: ${u.uid}] (Role: ${u.customClaims?.role || 'none'})`);
  });

  console.log('\n=== 2. CHECKING MARIADB TABLES AND POPULATED ROWS ===');
  const remoteQuery = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
const { pool } = require("./database/mysql");
async function check() {
  const [tables] = await pool.query("SHOW TABLES;");
  const tableNameKey = Object.keys(tables[0])[0];
  for (const t of tables) {
    const name = t[tableNameKey];
    try {
      const [cnt] = await pool.query("SELECT COUNT(*) as count FROM \`" + name + "\`");
      const c = cnt[0].count;
      if (c > 0) {
        console.log("TABLE: " + name + " (" + c + " rows)");
        if (name.includes("tenant") || name.includes("org") || name.includes("user") || name.includes("enterprise") || name.includes("member")) {
          const [rows] = await pool.query("SELECT * FROM \`" + name + "\` LIMIT 10");
          console.log(JSON.stringify(rows, null, 2));
        }
      }
    } catch (err) {
      console.log("TABLE_ERR " + name + ": " + err.message);
    }
  }
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
'
`;

  const dbRes = runSsh(remoteQuery);
  console.log(dbRes);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
