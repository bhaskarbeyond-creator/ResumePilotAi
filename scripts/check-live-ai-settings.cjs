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

console.log('Checking system_settings and AI configuration on live server...');
const remoteScript = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
const { pool } = require("./database/mysql");
const { getAiAdminSettings } = require("./services/aiAdmin");

async function checkAi() {
  const [settings] = await pool.query("SELECT category, revision FROM system_settings;");
  console.log("ALL SYSTEM SETTINGS CATEGORIES:", settings);
  
  const [aiRows] = await pool.query("SELECT category, data, revision FROM system_settings WHERE category IN (\\"ai_providers\\", \\"ai_quota\\", \\"system_settings\\");");
  console.log("AI ROWS IN DB:", JSON.stringify(aiRows, null, 2));

  const loaded = await getAiAdminSettings();
  console.log("LOADED AI SETTINGS (Public view):", JSON.stringify(loaded, null, 2));

  process.exit(0);
}
checkAi().catch(e => { console.error(e); process.exit(1); });
'
`;

const res = runSsh(remoteScript);
console.log(res);
