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
const { requestProvider } = require("./services/aiRuntime");
const { getRepository } = require("./repositories");
const { buildInterviewPrompt } = require("./routes/ai");
require("dotenv").config();

async function test() {
  const config = await getRepository().getSetting("ai_providers");
  const nvidiaConfig = config.nvidia;
  nvidiaConfig.key = nvidiaConfig.key || nvidiaConfig.apiKey;

  const built10 = buildInterviewPrompt({
    occupation: "Full Stack Developer",
    interviewType: "technical",
    questionCount: 10,
    language: "en",
    experienceLevel: "mid",
    difficulty: "medium"
  });

  console.log("Starting 10-question test on NVIDIA...");
  const t0 = Date.now();
  const raw = await requestProvider("nvidia", nvidiaConfig, built10.prompt, { maxTokens: 3200, temperature: 0.5 }, { timeoutMs: 150000 });
  const elapsed = Date.now() - t0;
  console.log("Completed in " + elapsed + "ms! Raw length: " + raw.length);
  const parsed = JSON.parse(raw);
  console.log("Total questions parsed:", parsed.questions?.length);
}
test().catch(e => { console.error("Error:", e.message); process.exit(1); });
'
`;

console.log(runSsh(remoteScript));
