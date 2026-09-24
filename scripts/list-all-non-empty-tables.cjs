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

const remoteQuery = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
const { pool } = require("./database/mysql");
async function check() {
  const [tables] = await pool.query("SHOW TABLES;");
  const tableNameKey = Object.keys(tables[0])[0];
  console.log("=== ALL NON-EMPTY TABLES IN MARIADB ===");
  for (const t of tables) {
    const name = t[tableNameKey];
    try {
      const [cnt] = await pool.query("SELECT COUNT(*) as count FROM \`" + name + "\`");
      if (cnt[0].count > 0) {
        console.log("  " + name + ": " + cnt[0].count + " rows");
      }
    } catch (e) {
      console.log("  ERR " + name + ": " + e.message);
    }
  }

  console.log("\\n=== ENTERPRISE TENANTS ===");
  const [tenants] = await pool.query("SELECT id, slug, displayName, legacyOwnerUid, lifecycleState FROM enterprise_tenants;");
  console.log(JSON.stringify(tenants, null, 2));

  console.log("\\n=== RESUMES IN DB ===");
  const [resumes] = await pool.query("SELECT * FROM resumes;");
  console.log(JSON.stringify(resumes, null, 2));

  console.log("\\n=== PLATFORM ANNOUNCEMENTS IN DB ===");
  const [announcements] = await pool.query("SELECT * FROM platform_announcements;");
  console.log(JSON.stringify(announcements, null, 2));

  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
'
`;

const out = runSsh(remoteQuery);
console.log(out);
