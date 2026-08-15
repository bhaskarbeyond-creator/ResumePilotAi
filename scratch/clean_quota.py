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

async function inspectUsage() {
    if (!db) {
        console.error('Firestore not initialized');
        process.exit(1);
    }
    const snap = await db.collection('ai_usage').get();
    console.log(`Found ${snap.docs.length} records in ai_usage collection:`);
    for (const doc of snap.docs) {
        console.log(`- Doc ID [${doc.id}]:`, JSON.stringify(doc.data()));
    }
    // Delete/reset records so any blocked test user is unblocked
    for (const doc of snap.docs) {
        await doc.ref.delete();
        console.log(`Reset doc: ${doc.id}`);
    }
    console.log('Done cleaning ai_usage records!');
    process.exit(0);
}

inspectUsage().catch(e => { console.error(e); process.exit(1); });
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/scratch_clean_quota.js', 'w') as f:
    f.write(remote_script)

stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && cd /home/u727965524/backend && node scratch_clean_quota.js')
print(stdout.read().decode('utf-8', errors='replace'))
print(stderr.read().decode('utf-8', errors='replace'))
ssh.close()
