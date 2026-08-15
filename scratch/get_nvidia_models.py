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
const { loadProviderConfiguration } = require('./services/aiRuntime');

async function run() {
    const config = await loadProviderConfiguration(db);
    const key = config.providers.nvidia?.key;
    const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` }
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Total models available:', data.data?.length);
    const chatModels = (data.data || []).map(m => m.id).sort();
    console.log(JSON.stringify(chatModels, null, 2));
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/get_models.js', 'w') as f:
    f.write(remote_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && cd /home/u727965524/backend && node get_models.js && rm get_models.js")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
