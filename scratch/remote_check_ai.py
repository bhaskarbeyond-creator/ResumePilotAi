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

const { loadAiAdminSettings } = require('./services/aiAdmin');
const { loadProviderConfiguration } = require('./services/aiRuntime');

async function check() {
    const db = admin.firestore();
    console.log('=== 1. FIRESTORE PUBLIC CONFIG ===');
    const pubDoc = await db.collection('data').doc('public_config').get();
    console.log('public_config exists:', pubDoc.exists, pubDoc.data());

    console.log('=== 2. FIRESTORE SECRET CONFIG ===');
    const secDoc = await db.collection('settings').doc('ai_providers').get();
    console.log('ai_providers exists:', secDoc.exists);
    if (secDoc.exists) {
        const d = secDoc.data() || {};
        for (const [k, v] of Object.entries(d)) {
            if (k === '_revision') console.log('  _revision:', v);
            else console.log(`  ${k}: model=${v?.model || 'default'}, hasKey=${Boolean(v?.apiKey)}`);
        }
    }

    console.log('=== 3. ENVIRONMENT KEYS ===');
    const providers = ['nvidia', 'gemini', 'openai', 'groq', 'openrouter', 'deepseek'];
    for (const p of providers) {
        console.log(`  ${p}: envKey=${Boolean(process.env[p.toUpperCase() + '_API_KEY'])}`);
    }

    console.log('=== 4. LOADED AI ADMIN SETTINGS ===');
    const loaded = await loadAiAdminSettings(db);
    console.log('Loaded admin settings:', JSON.stringify(loaded, null, 2));

    console.log('=== 5. LOADED RUNTIME CONFIG ===');
    const runtime = await loadProviderConfiguration(db);
    console.log('Loaded runtime config:', JSON.stringify(runtime, null, 2));

    process.exit(0);
}
check().catch(e => { console.error('Check Error:', e); process.exit(1); });
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/scratch_check_ai.js', 'w') as f:
    f.write(remote_code)

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'
stdin, stdout, stderr = ssh.exec_command(f'{node_env} && cd /home/u727965524/backend && node scratch_check_ai.js')
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

try:
    sftp.remove('/home/u727965524/backend/scratch_check_ai.js')
except Exception:
    pass
ssh.close()
