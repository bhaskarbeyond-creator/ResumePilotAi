import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

sftp = ssh.open_sftp()
update_script = r"""
require('dotenv').config({ path: '/home/u727965524/backend/.env' });
const admin = require('/home/u727965524/backend/services/firebaseAdmin');

async function update() {
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

    console.log('Setting default nvidiaModel in public_config to meta/llama-3.1-8b-instruct...');
    await db.collection('data').doc('public_config').set({
        ai: {
            provider: 'nvidia',
            nvidiaModel: 'meta/llama-3.1-8b-instruct',
            enableNvidia: true,
            enableFallback: true,
            temperature: 0.7,
            maxTokens: 2048
        }
    }, { merge: true });

    console.log('Setting model in settings/ai_providers to meta/llama-3.1-8b-instruct...');
    await db.collection('settings').doc('ai_providers').set({
        nvidia: {
            model: 'meta/llama-3.1-8b-instruct'
        }
    }, { merge: true });

    console.log('Successfully updated production AI configuration to meta/llama-3.1-8b-instruct!');
}
update().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
"""

with sftp.file('/home/u727965524/update_model.js', 'w') as f:
    f.write(update_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && export NODE_PATH=/home/u727965524/backend/node_modules && cd /home/u727965524/backend && node /home/u727965524/update_model.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
ssh.close()
