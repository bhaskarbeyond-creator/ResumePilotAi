import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('82.112.232.112', port=65002, username='u727965524', key_filename=r'C:\Users\mbhas\.ssh\id_ed25519')

remote_code = r"""
require('dotenv').config();
const { requestProvider } = require('./services/aiRuntime');

async function testCall() {
    const key = "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";
    console.log('Testing NVIDIA key with poolside/laguna-xs-2.1 ...');
    try {
        const res1 = await requestProvider('nvidia', { key, model: 'poolside/laguna-xs-2.1' }, 'Say hello in 3 words.', { temperature: 0.7, maxTokens: 50 });
        console.log('✅ Laguna XS 2.1 SUCCESS:', res1);
    } catch (e) {
        console.error('❌ Laguna XS 2.1 FAILED:', e.message, 'Status:', e.status);
    }

    console.log('Testing NVIDIA key with meta/llama-3.3-70b-instruct ...');
    try {
        const res2 = await requestProvider('nvidia', { key, model: 'meta/llama-3.3-70b-instruct' }, 'Say hello in 3 words.', { temperature: 0.7, maxTokens: 50 });
        console.log('✅ Llama 3.3 70B SUCCESS:', res2);
    } catch (e) {
        console.error('❌ Llama 3.3 70B FAILED:', e.message, 'Status:', e.status);
    }

    console.log('Testing NVIDIA key with deepseek-ai/deepseek-r1 ...');
    try {
        const res3 = await requestProvider('nvidia', { key, model: 'deepseek-ai/deepseek-r1' }, 'Say hello in 3 words.', { temperature: 0.7, maxTokens: 50 });
        console.log('✅ DeepSeek R1 SUCCESS:', res3);
    } catch (e) {
        console.error('❌ DeepSeek R1 FAILED:', e.message, 'Status:', e.status);
    }

    process.exit(0);
}
testCall();
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/scratch_test_nvidia.js', 'w') as f:
    f.write(remote_code)

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'
stdin, stdout, stderr = ssh.exec_command(f'{node_env} && cd /home/u727965524/backend && node scratch_test_nvidia.js')
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

try:
    sftp.remove('/home/u727965524/backend/scratch_test_nvidia.js')
except Exception:
    pass
ssh.close()
