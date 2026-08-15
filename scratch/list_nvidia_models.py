import paramiko
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

sftp = ssh.open_sftp()
list_script = r"""
const fetch = require('node-fetch');
global.fetch = fetch;
require('dotenv').config({ path: '/home/u727965524/backend/.env' });
const admin = require('/home/u727965524/backend/services/firebaseAdmin');

async function listModels() {
    let db = null;
    try {
        if (!admin.apps.length) {
            const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
            const credential = admin.credential.cert({
                projectId,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            });
            admin.initializeApp({ credential, projectId });
        }
        db = admin.firestore();
    } catch (e) { console.error(e); }

    const apiKey = process.env.NVIDIA_API_KEY || (await db.collection('settings').doc('ai_providers').get()).data()?.nvidia?.apiKey;

    const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await res.json();
    const models = (data.data || []).map(m => m.id);
    console.log(`Total NVIDIA NIM models: ${models.length}`);
    console.log(models.filter(m => m.includes('instruct') || m.includes('chat') || m.includes('8b') || m.includes('7b') || m.includes('llama') || m.includes('gpt') || m.includes('nemotron')).sort().join('\n'));
}

listModels().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
"""

with sftp.file('/home/u727965524/list_models.js', 'w') as f:
    f.write(list_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && export NODE_PATH=/home/u727965524/backend/node_modules && cd /home/u727965524/backend && node /home/u727965524/list_models.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
ssh.close()
