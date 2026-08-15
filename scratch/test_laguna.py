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
const admin = require('/home/u727965524/backend/services/firebaseAdmin');

async function testLaguna() {
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

    console.log('Testing poolside/laguna-xs-2.1 with different prompts & parameters:\n');

    const testCases = [
        { name: 'Simple Ping ("Reply with exactly OK.")', body: { model: 'poolside/laguna-xs-2.1', messages: [{ role: 'user', content: 'Reply with exactly OK.' }], temperature: 0, max_tokens: 10 } },
        { name: 'Summary prompt (temperature 0.7, max_tokens 300)', body: { model: 'poolside/laguna-xs-2.1', messages: [{ role: 'user', content: 'Generate a professional resume summary for a Full Stack Developer.' }], temperature: 0.7, max_tokens: 300 } },
        { name: 'Skills JSON prompt (temperature 0.3, max_tokens 600)', body: { model: 'poolside/laguna-xs-2.1', messages: [{ role: 'user', content: 'Output a JSON object with a "skills" array of strings for a React developer: {"skills": ["React", "TypeScript"]}' }], temperature: 0.3, max_tokens: 600 } },
        { name: 'Certifications JSON prompt', body: { model: 'poolside/laguna-xs-2.1', messages: [{ role: 'user', content: 'Recommend 4 certifications for AWS DevOps in JSON: {"certifications": [{"name": "AWS Certified DevOps Engineer"}]}' }], temperature: 0.3, max_tokens: 600 } }
    ];

    for (const tc of testCases) {
        process.stdout.write(`- ${tc.name.padEnd(60)} ... `);
        const start = Date.now();
        try {
            const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(tc.body),
                timeout: 30000
            });
            const elapsed = Date.now() - start;
            if (response.ok) {
                const data = await response.json();
                const text = data.choices?.[0]?.message?.content || '';
                console.log(`✓ HTTP ${response.status} in ${elapsed}ms -> "${text.slice(0, 50).replace(/\n/g, ' ')}..."`);
            } else {
                const err = await response.text();
                console.log(`✗ HTTP ${response.status} in ${elapsed}ms: ${err.slice(0, 100)}`);
            }
        } catch (err) {
            console.log(`✗ EXCEPTION in ${Date.now() - start}ms: ${err.message}`);
        }
    }
}

testLaguna().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
"""

with sftp.file('/home/u727965524/test_laguna_direct.js', 'w') as f:
    f.write(test_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && export NODE_PATH=/home/u727965524/backend/node_modules && cd /home/u727965524/backend && node /home/u727965524/test_laguna_direct.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
ssh.close()
