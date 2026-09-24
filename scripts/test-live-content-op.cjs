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

console.log('Testing executeContentOperation on live server...');
const remoteScript = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
require("dotenv").config();
const { executeContentOperation } = require("./services/aiRuntime");

async function testOp() {
  console.log("Calling executeContentOperation for generate-summary...");
  try {
    const result = await executeContentOperation({
      operation: "generate-summary",
      payload: {
        jobTitle: "Software Engineer",
        targetRole: "Senior Software Engineer",
        experienceYears: 5,
        skills: ["React", "Node.js", "MySQL"]
      }
    });
    console.log("RESULT SUCCESS:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("EXECUTE_CONTENT_OP ERROR:", err);
    if (err.cause) console.error("CAUSE:", err.cause);
  }

  process.exit(0);
}
testOp().catch(e => { console.error("FATAL:", e); process.exit(1); });
'
`;

const res = runSsh(remoteScript);
console.log(res);
