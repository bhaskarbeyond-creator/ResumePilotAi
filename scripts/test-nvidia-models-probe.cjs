const { execFileSync } = require('child_process');
const path = require('path');

const remoteScript = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
require("dotenv").config();
const { loadProviderConfiguration } = require("./services/aiRuntime");
async function main() {
  const config = await loadProviderConfiguration();
  const key = config.providers?.nvidia?.key;
  if (!key) { console.log("No key"); return; }
  async function testModel(model) {
    const t0 = Date.now();
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: "Say hello in 5 words." }],
          max_tokens: 30
        })
      });
      const d = await res.json();
      console.log(model, res.status, (Date.now()-t0) + "ms", d.choices?.[0]?.message?.content?.trim() || JSON.stringify(d.error || d.message));
    } catch(e) {
      console.log(model, "FAILED", e.message);
    }
  }
  await testModel("meta/llama-3.2-11b-vision-instruct");
  await testModel("mistralai/mistral-7b-instruct-v0.3");
  await testModel("nv-mistralai/mistral-nemo-12b-instruct");
}
main();
'
`;

const out = execFileSync('ssh', [
  '-i', path.join(__dirname, '..', 'dev_key'),
  '-p', '65002',
  '-o', 'StrictHostKeyChecking=yes',
  '-o', 'PasswordAuthentication=no',
  'u727965524@82.112.232.112',
  remoteScript
], { encoding: 'utf8' });

console.log(out);
