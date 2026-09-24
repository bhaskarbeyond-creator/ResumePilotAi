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
async function fixAi() {
  console.log("Fetching current AI settings from DB...");
  const [rows] = await pool.query("SELECT category, data, revision FROM system_settings WHERE category IN (\\"ai_providers\\", \\"public_config\\")");
  
  for (const row of rows) {
    const data = row.data || {};
    const rev = (row.revision || 0) + 1;
    if (row.category === "ai_providers") {
      data.provider = "nvidia";
      data.enableFallback = true;
      if (!data.nvidia) data.nvidia = {};
      data.nvidia.enabled = true;
      data.nvidia.model = "meta/llama-3.2-11b-vision-instruct";
      if (!data.nvidia.apiKey) {
        data.nvidia.apiKey = process.env.NVIDIA_API_KEY || "";
      }
      await pool.query("UPDATE system_settings SET data = ?, revision = ? WHERE category = ?", [
        JSON.stringify(data), rev, "ai_providers"
      ]);
      console.log("✅ Updated ai_providers to revision", rev);
    }
    if (row.category === "public_config") {
      if (!data.ai) data.ai = {};
      data.ai.provider = "nvidia";
      data.ai.enableNvidia = true;
      data.ai.nvidiaModel = "meta/llama-3.2-11b-vision-instruct";
      data.ai.enableFallback = true;
      await pool.query("UPDATE system_settings SET data = ?, revision = ? WHERE category = ?", [
        JSON.stringify(data), rev, "public_config"
      ]);
      console.log("✅ Updated public_config to revision", rev);
    }
  }

  // Clear server cache if any
  console.log("Verifying updated settings...");
  const [updated] = await pool.query("SELECT category, data, revision FROM system_settings WHERE category IN (\\"ai_providers\\", \\"public_config\\")");
  for (const u of updated) {
    console.log("Category:", u.category, "Revision:", u.revision);
    if (u.category === "ai_providers") console.log("Provider:", u.data.provider, "Nvidia Model:", u.data.nvidia?.model, "Has Key:", Boolean(u.data.nvidia?.apiKey));
    if (u.category === "public_config") console.log("Public AI:", JSON.stringify(u.data.ai, null, 2));
  }
  process.exit(0);
}
fixAi().catch(e => { console.error("Error:", e); process.exit(1); });
'
`;

console.log('Running AI database fix on remote server...');
console.log(runSsh(remoteScript));
