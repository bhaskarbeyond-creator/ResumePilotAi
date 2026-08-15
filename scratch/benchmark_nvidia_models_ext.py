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
    'meta/llama-3.2-3b-instruct',
    'meta/llama-3.2-1b-instruct',
    'mistralai/mistral-nemo-12b-instruct',
    'google/gemma-2-9b-it',
    'qwen/qwen2.5-7b-instruct',
    'microsoft/phi-3-mini-128k-instruct',
    'microsoft/phi-3-small-8k-instruct',
    'openai/gpt-oss-120b'
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

    console.log('=== Extended NVIDIA NIM Speed & Latency Benchmark ===\n');

    for (const model of testModels) {
        process.stdout.write(`Testing ${model.padEnd(38)} ... `);
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
                        { role: 'user', content: 'Say "OK" and list 3 skills for a web developer.' }
                    ],
                    temperature: 0.7,
                    max_tokens: 100
                }),
                timeout: 15000
            });
            const elapsed = Date.now() - start;
            if (response.ok) {
                const data = await response.json();
                const text = data.choices?.[0]?.message?.content || '';
                console.log(`✓ HTTP ${response.status} in ${elapsed}ms (${text.slice(0, 40).replace(/\n/g, ' ')}...)`);
            } else {
                const errText = await response.text();
                console.log(`✗ HTTP ${response.status} in ${elapsed}ms: ${errText.slice(0, 80)}`);
            }
        } catch (err) {
            const elapsed = Date.now() - start;
            console.log(`✗ FAILED in ${elapsed}ms: ${err.message}`);
        }
    }
}

runBenchmark().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
"""

with sftp.file('/home/u727965524/bench_nvidia_ext.js', 'w') as f:
    f.write(bench_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && export NODE_PATH=/home/u727965524/backend/node_modules && cd /home/u727965524/backend && node /home/u727965524/bench_nvidia_ext.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
ssh.close()
