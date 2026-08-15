import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('82.112.232.112', port=65002, username='u727965524', key_filename=r'C:\Users\mbhas\.ssh\id_ed25519')

remote_code = r"""
require('dotenv').config();
const { requestProvider } = require('./services/aiRuntime');

async function testModels() {
    const key = process.env.NVIDIA_API_KEY || "";
    const candidates = [
        'poolside/laguna-xs-2.1',
        'meta/llama-3.1-8b-instruct',
        'meta/llama-3.1-70b-instruct',
        'nvidia/nemotron-4-340b-instruct',
        'deepseek-ai/deepseek-r1-distill-llama-70b',
        'mistralai/mistral-7b-instruct-v0.3'
    ];

    for (const model of candidates) {
        try {
            const start = Date.now();
            const res = await requestProvider('nvidia', { key, model }, 'Hi', { temperature: 0.7, maxTokens: 20 }, { timeoutMs: 15000 });
            console.log(`✅ ${model.padEnd(45)} -> SUCCESS (${Date.now() - start}ms): "${res.trim()}"`);
        } catch (e) {
            console.log(`❌ ${model.padEnd(45)} -> FAILED (${e.status || 'timeout'}): ${e.message}`);
        }
    }
    process.exit(0);
}
testModels();
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/scratch_test_models.js', 'w') as f:
    f.write(remote_code)

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'
stdin, stdout, stderr = ssh.exec_command(f'{node_env} && cd /home/u727965524/backend && node scratch_test_models.js')
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

try:
    sftp.remove('/home/u727965524/backend/scratch_test_models.js')
except Exception:
    pass
ssh.close()
