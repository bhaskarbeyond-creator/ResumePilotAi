import paramiko
import os
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

remote_script = """
require('dotenv').config();
const admin = require('./services/firebaseAdmin');

async function grantAdmin() {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g, '\\n') : undefined;
    
    admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        projectId
    });

    const adminEmails = ['bhaskar.beyond@gmail.com', 'mbhaskarbabuu@gmail.com', 'bhaskar.deer@gmail.com'];
    
    for (const email of adminEmails) {
        try {
            const user = await admin.auth().getUserByEmail(email);
            await admin.auth().setCustomUserClaims(user.uid, { role: 'ADMIN', permissions: ['*'] });
            console.log(`✅ Granted ADMIN custom claim to ${email} (UID: ${user.uid})`);
        } catch (e) {
            console.warn(`⚠️ Could not set claim for ${email}:`, e.message);
        }
    }
    process.exit(0);
}
grantAdmin().catch(err => { console.error('Grant Script Error:', err.message); process.exit(1); });
"""

with sftp.file('/home/u727965524/backend/scratch_grant.js', 'w') as f:
    f.write(remote_script)

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'
stdin, stdout, stderr = ssh.exec_command(f'{node_env} && cd /home/u727965524/backend && node scratch_grant.js')
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

sftp.remove('/home/u727965524/backend/scratch_grant.js')
ssh.close()
