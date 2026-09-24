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
const { buildInterviewPrompt } = require("./routes/ai");
const { requestProvider } = require("./services/aiRuntime");
const mysql = require("mysql2/promise");
require("dotenv").config();

async function test() {
  const { getRepository } = require("./repositories");
  const config = await getRepository().getSetting("ai_providers");
  for (const [k, v] of Object.entries(config)) {
    if (v && typeof v === "object") {
      console.log(k, "hasKey:", !!(v.apiKey || v.key), "model:", v.model);
    }
  }
  process.exit(0);
}
test().catch(console.error);
'
`;

console.log(runSsh(remoteScript));
