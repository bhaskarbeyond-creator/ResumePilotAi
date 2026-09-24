const { execFileSync } = require('child_process');
const path = require('path');
const SSH_KEY = path.join(__dirname, '..', 'dev_key');

const cmd = `export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
const { pool } = require("./database/mysql");
async function check() {
  const [dbs] = await pool.query("SHOW DATABASES;");
  console.log("Databases:", JSON.stringify(dbs));
  const [tables] = await pool.query("SHOW TABLES;");
  console.log("Tables count in current DB:", tables.length);
  try {
    const [users] = await pool.query("SELECT id, email, role, created_at FROM users WHERE role = ? OR email LIKE ? LIMIT 10;", ["superadmin", "%bhaskar%"]);
    console.log("Admins/Bhaskar in DB:", JSON.stringify(users));
  } catch (e) {
    console.log("Could not query users table:", e.message);
  }
  process.exit(0);
}
check().catch(e => { console.error("DB error:", e); process.exit(1); });
'`;

const res = execFileSync('ssh', [
  '-i', SSH_KEY,
  '-p', '65002',
  '-o', 'StrictHostKeyChecking=yes',
  '-o', 'PasswordAuthentication=no',
  'u727965524@82.112.232.112',
  cmd
], { encoding: 'utf8' });
console.log(res);
