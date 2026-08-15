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
bench_script = r"""
const fetch = require('node-fetch');
global.fetch = fetch;
require('dotenv').config({ path: '/home/u727965524/backend/.env' });
const admin = require('/home/u727965524/backend/services/firebaseAdmin');

const testModels = [
    'meta/llama-3.1-8b-instruct',
    'mistralai/mistral-7b-instruct-v0.3',
    'meta/llama-3.3-70b-instruct',
    'openai/gpt-oss-120b',
    'nvidia/nemotron-4-340b-instruct',
    'deepseek-ai/deepseek-r1'
];

async function runBenchmark() {
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

    console.log('=== NVIDIA NIM Model Latency & Speed Benchmark ===\n');

    for (const model of testModels) {
        process.stdout.write(`Testing ${model.padEnd(36)} ... `);
        const start = Date.now();
        try {
            const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'user', content: 'Generate 3 high-impact resume bullet points for a Senior Full Stack Software Engineer specializing in React and Node.js.' }
                    ],
                    temperature: 0.7,
                    max_tokens: 250
                }),
                timeout: 30000
            });
            const elapsed = Date.now() - start;
            if (response.ok) {
                const data = await response.json();
                const text = data.choices?.[0]?.message?.content || '';
                console.log(`✓ HTTP ${response.status} in ${elapsed}ms (${text.length} chars)`);
            } else {
                const errText = await response.text();
                console.log(`✗ HTTP ${response.status} in ${elapsed}ms: ${errText.slice(0, 100)}`);
            }
        } catch (err) {
            const elapsed = Date.now() - start;
            console.log(`✗ TIMEOUT/ERROR in ${elapsed}ms: ${err.message}`);
        }
    }
}

runBenchmark().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
"""

with sftp.file('/home/u727965524/bench_nvidia.js', 'w') as f:
    f.write(bench_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && export NODE_PATH=/home/u727965524/backend/node_modules && cd /home/u727965524/backend && node /home/u727965524/bench_nvidia.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
ssh.close()
