import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('82.112.232.112', port=65002, username='u727965524', key_filename=r'C:\Users\mbhas\.ssh\id_ed25519')

remote_code = r"""
require('dotenv').config();
const admin = require('./services/firebaseAdmin');

const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

if (clientEmail && privateKey) {
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }), projectId });
} else {
    admin.initializeApp({ projectId });
}

const { testAiProvider } = require('./services/aiAdmin');

async function testAll() {
    const db = admin.firestore();
    const providers = ['nvidia', 'gemini', 'openai', 'groq', 'openrouter', 'deepseek'];

    for (const p of providers) {
        try {
            console.log(`Testing ${p} ...`);
            const res = await testAiProvider({ db, provider: p, timeoutMs: 15000 });
            console.log(`✅ ${p} TEST PASSED:`, res);
        } catch (e) {
            console.log(`❌ ${p} TEST FAILED: [${e.code || 'NO_CODE'}] status=${e.status} -> ${e.message}`);
        }
    }
    process.exit(0);
}
testAll();
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/scratch_test_providers.js', 'w') as f:
    f.write(remote_code)

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'
stdin, stdout, stderr = ssh.exec_command(f'{node_env} && cd /home/u727965524/backend && node scratch_test_providers.js')
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

try: sftp.remove('/home/u727965524/backend/scratch_test_providers.js')
except Exception: pass
ssh.close()
