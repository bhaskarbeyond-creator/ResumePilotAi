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

async function check() {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g, '\\n') : undefined;
    
    if (clientEmail && privateKey) {
        admin.initializeApp({
            credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
            projectId
        });
    } else {
        admin.initializeApp({ projectId });
    }

    const list = await admin.auth().listUsers(100);
    console.log('=== USERS & CUSTOM CLAIMS ===');
    list.users.forEach(u => {
        console.log(`Email: ${u.email} | UID: ${u.uid} | Claims: ${JSON.stringify(u.customClaims || {})}`);
    });
    process.exit(0);
}
check().catch(err => { console.error('Script Error:', err.message); process.exit(1); });
"""

with sftp.file('/home/u727965524/backend/scratch_list.js', 'w') as f:
    f.write(remote_script)

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'
stdin, stdout, stderr = ssh.exec_command(f'{node_env} && cd /home/u727965524/backend && node scratch_list.js')
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

sftp.remove('/home/u727965524/backend/scratch_list.js')
ssh.close()
