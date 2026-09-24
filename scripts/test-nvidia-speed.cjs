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
require("dotenv").config();

async function test() {
  const config = await getRepository().getSetting("ai_providers");
  const nvidiaConfig = config.nvidia;
  nvidiaConfig.key = nvidiaConfig.key || nvidiaConfig.apiKey;

  // Streamlined, high-performance prompt
  const fastPrompt = \`You are an Elite Technical Hiring Bar Raiser creating a 5-question technical assessment for a Full Stack Developer.
Produce 5 realistic scenario-based multiple choice questions testing critical thinking, system design, and debugging.
Keep scenarios under 30 words. Keep options under 12 words. Keep explanation to 1 concise sentence.

Output MUST be valid JSON with this exact structure:
{
  "title": "Full Stack Developer - Technical Assessment",
  "company": "Professional Evaluation Services",
  "department": "Technical Department",
  "duration": "15 minutes",
  "totalQuestions": 5,
  "passingScore": 70,
  "categories": ["Architecture", "Debugging", "Performance"],
  "questions": [
    {
      "id": 1,
      "question": "Concise practical scenario question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "category": "Architecture",
      "difficulty": "Intermediate",
      "weight": 1,
      "explanation": "Why option A is correct.",
      "estimatedTime": 120
    }
  ]
}
Return ONLY valid JSON.\`;

  console.log("Starting streamlined 5-question test on NVIDIA...");
  const t0 = Date.now();
  const raw = await requestProvider("nvidia", nvidiaConfig, fastPrompt, { maxTokens: 1600, temperature: 0.5 }, { timeoutMs: 90000 });
  const elapsed = Date.now() - t0;
  console.log("Completed in " + elapsed + "ms! Raw length: " + raw.length);
  const parsed = JSON.parse(raw);
  console.log("Successfully parsed JSON! Total questions:", parsed.questions?.length);
  console.log("Q1:", parsed.questions?.[0]?.question);
}
test().catch(e => { console.error("Error:", e.message); process.exit(1); });
'
`;

console.log(runSsh(remoteScript));
