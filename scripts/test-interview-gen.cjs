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

console.log('Testing /api/generate-interview on port 8080 on live server...');
const remoteScript = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
require("dotenv").config();
const { loadProviderConfiguration } = require("./services/aiRuntime");

async function testInterview() {
  const config = await loadProviderConfiguration();
  console.log("Configured Primary:", config.primary);
  console.log("Providers:", Object.keys(config.providers).filter(p => config.providers[p].enabled));

  const start = Date.now();
  try {
    const res = await fetch("http://127.0.0.1:8080/api/generate-interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        occupation: "Full Stack Developer",
        interviewType: "technical",
        questionCount: 5,
        language: "en"
      })
    });
    const elapsed = Date.now() - start;
    const body = await res.text();
    console.log("HTTP Status:", res.status, "in " + elapsed + "ms");
    console.log("Response Preview:", body.slice(0, 300));
  } catch (err) {
    console.error("Fetch error:", err.message);
  }

  process.exit(0);
}
testInterview().catch(e => { console.error(e); process.exit(1); });
'
`;

console.log(runSsh(remoteScript));
