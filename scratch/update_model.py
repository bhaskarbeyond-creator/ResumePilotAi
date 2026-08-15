import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('82.112.232.112', port=65002, username='u727965524', key_filename=r'C:\Users\mbhas\.ssh\id_ed25519')

remote_script = """
require('dotenv').config();
const admin = require('./services/firebaseAdmin');

let db = null;
try {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        const credential = admin.credential.cert({
            projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g, '\\n'),
        });
        admin.initializeApp({ credential, projectId });
        db = admin.firestore();
    }
} catch (e) {
    console.error('Firebase init error:', e.message);
}

async function updateModel() {
    if (!db) {
        console.error('Firestore not initialized');
        process.exit(1);
    }
    // Update settings/ai_providers nvidia model to meta/llama-3.1-8b-instruct
    const docRef = db.collection('settings').doc('ai_providers');
    const doc = await docRef.get();
    if (doc.exists) {
        const data = doc.data() || {};
        if (data.nvidia) {
            data.nvidia.model = 'meta/llama-3.1-8b-instruct';
            await docRef.set(data, { merge: true });
            console.log('Updated settings/ai_providers nvidia model to meta/llama-3.1-8b-instruct');
        }
    }
    // Also update data/public_config if present
    const pubRef = db.collection('data').doc('public_config');
    const pubDoc = await pubRef.get();
    if (pubDoc.exists) {
        const pubData = pubDoc.data() || {};
        if (pubData.ai) {
            pubData.ai.nvidiaModel = 'meta/llama-3.1-8b-instruct';
            await pubRef.set(pubData, { merge: true });
            console.log('Updated data/public_config ai.nvidiaModel');
        }
    }
    console.log('Done!');
    process.exit(0);
}

updateModel().catch(e => { console.error(e); process.exit(1); });
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/scratch_update_model.js', 'w') as f:
    f.write(remote_script)

stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && cd /home/u727965524/backend && node scratch_update_model.js')
print(stdout.read().decode('utf-8', errors='replace'))
print(stderr.read().decode('utf-8', errors='replace'))
ssh.close()
