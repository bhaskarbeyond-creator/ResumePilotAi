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

console.log('Testing AI generation live on server...');
const remoteScript = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
require("dotenv").config();
const { executeGenerate } = require("./services/aiRuntime");
const { getAiAdminSettings } = require("./services/aiAdmin");

async function testAi() {
  console.log("Invoking AI generation test...");
  try {
    const res = await executeGenerate({
      operation: "generate-summary",
      payload: {
        jobTitle: "Software Engineer",
        targetRole: "Senior Software Engineer",
        experienceYears: 5,
        skills: ["React", "Node.js", "MySQL"]
      },
      sessionId: "diag-" + Date.now()
    });
    console.log("AI SUCCESS:", JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("AI GENERATION ERROR:", err);
    if (err.cause) console.error("CAUSE:", err.cause);
    if (err.details) console.error("DETAILS:", err.details);
  }
  process.exit(0);
}
testAi().catch(e => { console.error("FATAL:", e); process.exit(1); });
'
`;

const res = runSsh(remoteScript);
console.log(res);
