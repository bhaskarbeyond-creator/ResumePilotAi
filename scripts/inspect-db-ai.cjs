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
async function main() {
  const [rows] = await pool.query("SELECT category, data FROM system_settings WHERE category IN (\\"public_config\\", \\"admin_configuration\\", \\"ai_providers\\")");
  for (const r of rows) {
    console.log("=== CATEGORY: " + r.category + " ===");
    console.log("AI field:", JSON.stringify(r.data?.ai, null, 2));
    if (r.category === "ai_providers") console.log("Full data:", JSON.stringify(r.data, null, 2));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
'
`;

console.log(runSsh(remoteScript));
