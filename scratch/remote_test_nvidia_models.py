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

async function testNvidiaModels() {
    const db = admin.firestore();
    const models = [
        'meta/llama-3.1-8b-instruct',
        'poolside/laguna-xs-2.1',
        'meta/llama-3.3-70b-instruct'
    ];

    for (const model of models) {
        try {
            console.log(`Testing nvidia with model: ${model} ...`);
            const res = await testAiProvider({ db, provider: 'nvidia', model, timeoutMs: 15000 });
            console.log(`✅ ${model} TEST PASSED:`, res.message);
        } catch (e) {
            console.log(`❌ ${model} TEST FAILED: [${e.code || 'NO_CODE'}] status=${e.status} -> ${e.message}`);
        }
    }
    process.exit(0);
}
testNvidiaModels();
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/scratch_test_nvidia_models.js', 'w') as f:
    f.write(remote_code)

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'
stdin, stdout, stderr = ssh.exec_command(f'{node_env} && cd /home/u727965524/backend && node scratch_test_nvidia_models.js')
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

try: sftp.remove('/home/u727965524/backend/scratch_test_nvidia_models.js')
except Exception: pass
ssh.close()
