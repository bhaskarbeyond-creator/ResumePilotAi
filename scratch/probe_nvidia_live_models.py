import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('82.112.232.112', port=65002, username='u727965524', key_filename=r'C:\Users\mbhas\.ssh\id_ed25519')

remote_script = """
require('dotenv').config();
const admin = require('./services/firebaseAdmin');

const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g, '\\n') : undefined;

if (clientEmail && privateKey) {
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }), projectId });
} else {
    admin.initializeApp({ projectId });
}

const db = admin.firestore();
const { testAiProvider } = require('./services/aiAdmin');
const { loadProviderConfiguration } = require('./services/aiRuntime');

async function run() {
    const config = await loadProviderConfiguration(db);
    console.log('Current primary provider:', config.primary);
    console.log('Current NVIDIA model in config:', config.providers.nvidia?.model);
    console.log('Has NVIDIA key:', Boolean(config.providers.nvidia?.key));

    const modelsToTest = [
        'meta/llama-3.1-8b-instruct',
        'meta/llama-3.3-70b-instruct',
        'nvidia/llama-3.1-nemotron-70b-instruct',
        'mistralai/mistral-7b-instruct-v0.3',
        'mistralai/mixtral-8x7b-instruct-v0.1',
        'poolside/laguna-xs-2.1',
        'deepseek-ai/deepseek-r1',
        'qwen/qwen2.5-7b-instruct'
    ];

    for (const m of modelsToTest) {
        try {
            const start = Date.now();
            const result = await testAiProvider({
                db,
                provider: 'nvidia',
                model: m,
                timeoutMs: 15000
            });
            const elapsed = Date.now() - start;
            console.log('[PASS] Model: ' + m + ' -> Time: ' + elapsed + 'ms -> Message: ' + result.message);
        } catch (e) {
            console.log('[FAIL] Model: ' + m + ' -> Error: status=' + e.status + ' code=' + e.code + ' message=' + e.message);
        }
    }
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/probe_models.js', 'w') as f:
    f.write(remote_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && cd /home/u727965524/backend && node probe_models.js && rm probe_models.js")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
