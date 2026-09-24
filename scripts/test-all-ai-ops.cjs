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

console.log('Testing full AI operations matrix against live server...');
const remoteScript = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
require("dotenv").config();
const { executeContentOperation, generateWithProviders, loadProviderConfiguration, buildGroundedPrompt, parseAiResponse } = require("./services/aiRuntime");

async function testAll() {
  const config = await loadProviderConfiguration();
  console.log("Configured Primary:", config.primary);
  console.log("Configured NVIDIA Model:", config.providers?.nvidia?.model);
  console.log("NVIDIA Enabled:", config.providers?.nvidia?.enabled);
  console.log("Has NVIDIA Key:", Boolean(config.providers?.nvidia?.key));

  const operations = [
    {
      name: "generate-summary (with full facts)",
      op: "generate-summary",
      payload: {
        targetRole: "Full Stack Engineer",
        jobTitle: "Software Developer",
        experienceYears: 4,
        context: {
          facts: {
            roles: [{ title: "Developer", employer: "TechCorp", begin: "2022", end: "2026", description: "Built microservices and React apps" }],
            skills: ["JavaScript", "React", "Node.js", "MySQL"]
          }
        }
      }
    },
    {
      name: "generate-skills",
      op: "generate-skills",
      payload: {
        jobTitle: "Full Stack Developer",
        targetRole: "Full Stack Developer",
        context: {
          facts: {
            skills: ["JavaScript", "React"]
          }
        }
      }
    },
    {
      name: "enhance-single-bullet",
      op: "enhance-single-bullet",
      payload: {
        role: "Software Developer",
        entry: { candidateBullet: "Built React dashboard with Node backend for users" }
      }
    },
    {
      name: "autocomplete",
      op: "autocomplete",
      payload: {
        type: "skill",
        query: "Rea"
      }
    }
  ];

  for (const item of operations) {
    console.log("\\n--- Testing " + item.name + " ---");
    const start = Date.now();
    try {
      const res = await executeContentOperation({
        operation: item.op,
        payload: item.payload,
        requestId: "test-" + Date.now()
      });
      const elapsed = Date.now() - start;
      console.log("✅ SUCCESS in " + elapsed + "ms | Provider: " + res.provider + " | Model: " + res.model);
      console.log("   Output Preview:", JSON.stringify(res.data).slice(0, 150) + "...");
    } catch (err) {
      const elapsed = Date.now() - start;
      console.error("❌ FAILED in " + elapsed + "ms:", err.message);
      if (err.status) console.error("   Status:", err.status);
    }
  }

  process.exit(0);
}
testAll().catch(e => { console.error("Fatal:", e); process.exit(1); });
'
`;

const res = runSsh(remoteScript);
console.log(res);
