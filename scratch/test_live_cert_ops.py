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
test_script = r"""
const fetch = require('node-fetch');
global.fetch = fetch;
require('dotenv').config({ path: '/home/u727965524/backend/.env' });
const { executeContentOperation } = require('/home/u727965524/backend/services/aiRuntime');
const admin = require('/home/u727965524/backend/services/firebaseAdmin');

async function test() {
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

    console.log('Testing generate-certifications...');
    try {
        const certsRes = await executeContentOperation({
            operation: 'generate-certifications',
            payload: { jobTitle: 'Full Stack Software Engineer', occupation: 'Full Stack Software Engineer', skills: 'JavaScript, React, Node.js, Python, AWS' },
            db,
            environment: process.env
        });
        console.log('Certs Result:', JSON.stringify(certsRes, null, 2));
    } catch (err) {
        console.error('Certs Error:', err);
    }

    console.log('\nTesting generate-skills...');
    try {
        const skillsRes = await executeContentOperation({
            operation: 'generate-skills',
            payload: { jobTitle: 'Full Stack Software Engineer', occupation: 'Full Stack Software Engineer', workHistory: 'Senior Developer at Tech Corp' },
            db,
            environment: process.env
        });
        console.log('Skills Result:', JSON.stringify(skillsRes, null, 2));
    } catch (err) {
        console.error('Skills Error:', err);
    }
}
test().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
"""

with sftp.file('/home/u727965524/test_ops.js', 'w') as f:
    f.write(test_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && export NODE_PATH=/home/u727965524/backend/node_modules && cd /home/u727965524/backend && node /home/u727965524/test_ops.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
ssh.close()
