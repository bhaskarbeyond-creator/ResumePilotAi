const { execFileSync } = require('child_process');
const path = require('path');
const SSH_KEY = path.join(__dirname, '..', 'dev_key');

const cmd = `export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
const { pool } = require("./database/mysql");
async function check() {
  const [tables] = await pool.query("SHOW TABLES;");
  const tableNameKey = Object.keys(tables[0])[0];
  console.log("Total tables:", tables.length);
  for (const t of tables) {
    const name = t[tableNameKey];
    const [countRes] = await pool.query("SELECT COUNT(*) as count FROM \`" + name + "\`;");
    if (countRes[0].count > 0) {
      console.log(name.padEnd(35), countRes[0].count);
    }
  }
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
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
