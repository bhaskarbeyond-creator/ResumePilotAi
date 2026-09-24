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

const remoteScript = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
const { pool } = require("./database/mysql");
async function check() {
  const [tables] = await pool.query("SHOW TABLES;");
  console.log("TABLES IN DB:", tables.map(t => Object.values(t)[0]));

  try {
    const [migrations] = await pool.query("SELECT * FROM schema_migrations ORDER BY id;");
    console.log("APPLIED MIGRATIONS:", migrations);
  } catch (err) {
    console.log("schema_migrations table error:", err.message);
  }

  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
'
`;

console.log(runSsh(remoteScript));
