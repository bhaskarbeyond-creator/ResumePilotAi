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
test_script = r"""
const fetch = require('node-fetch');
global.fetch = fetch;
require('dotenv').config({ path: '/home/u727965524/backend/.env' });
const admin = require('/home/u727965524/backend/services/firebaseAdmin');

async function testLiveEndpoints() {
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

    // Mint a verified custom auth token for live HTTP route testing
    const customToken = await admin.auth().createCustomToken('test_prod_verifier', { email: 'verifier@airesume.projectdemo.guru', email_verified: true });
    // Exchange for ID token via Firebase Auth REST API
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    let idToken = null;
    if (apiKey) {
        const tokenRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: customToken, returnSecureToken: true })
        });
        const tokenData = await tokenRes.json();
        idToken = tokenData.idToken;
    }

    console.log('Testing live HTTPS POST https://airesume.projectdemo.guru/api/generate-content (generate-certifications)...');
    const startCert = Date.now();
    const certHttpRes = await fetch('https://airesume.projectdemo.guru/api/generate-content', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
            operation: 'generate-certifications',
            payload: {
                jobTitle: 'Senior Cloud DevOps Engineer',
                occupation: 'Senior Cloud DevOps Engineer',
                workHistory: 'Lead DevOps at Tech Scale Inc.',
                skills: 'AWS, Terraform, Kubernetes, CI/CD, Python'
            }
        })
    });
    const certHttpData = await certHttpRes.json();
    console.log(`HTTPS ${certHttpRes.status} in ${Date.now() - startCert}ms:`, JSON.stringify(certHttpData, null, 2));

    console.log('\nTesting live HTTP POST /api/generate-content (generate-skills)...');
    const startSkills = Date.now();
    const skillsHttpRes = await fetch('http://127.0.0.1:8080/api/generate-content', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
            operation: 'generate-skills',
            payload: {
                jobTitle: 'Senior React Developer',
                occupation: 'Senior React Developer',
                workHistory: 'Frontend Lead at Fintech Corp'
            }
        })
    });
    const skillsHttpData = await skillsHttpRes.json();
    console.log(`HTTP ${skillsHttpRes.status} in ${Date.now() - startSkills}ms:`, JSON.stringify(skillsHttpData, null, 2));
}

testLiveEndpoints().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
"""

with sftp.file('/home/u727965524/test_live_http_ops.js', 'w') as f:
    f.write(test_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && export NODE_PATH=/home/u727965524/backend/node_modules && cd /home/u727965524/backend && node /home/u727965524/test_live_http_ops.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
ssh.close()
