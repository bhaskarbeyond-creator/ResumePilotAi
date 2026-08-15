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
const { generateWithProviders, buildLegacyPrompt, parseAiResponse } = require('/home/u727965524/backend/services/aiRuntime');
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

    // Test with llama-3.1-8b-instruct
    const config = {
        primary: 'nvidia',
        enableFallback: false,
        temperature: 0.7,
        maxTokens: 2048,
        providers: {
            nvidia: {
                key: process.env.NVIDIA_API_KEY || (await db.collection('settings').doc('ai_providers').get()).data()?.nvidia?.apiKey,
                model: 'meta/llama-3.1-8b-instruct',
                enabled: true
            }
        }
    };

    console.log('Testing generate-certifications with meta/llama-3.1-8b-instruct...');
    const startTime = Date.now();
    const { prompt } = buildLegacyPrompt('generate-certifications', {
        jobTitle: 'Full Stack Software Engineer',
        skills: 'JavaScript, React, Node.js, AWS'
    });
    const res = await generateWithProviders({ prompt, configuration: config, operation: 'generate-certifications' });
    const elapsed = Date.now() - startTime;
    console.log(`generate-certifications completed in ${elapsed}ms!`);
    const parsed = parseAiResponse('generate-certifications', res.raw);
    console.log('Parsed Certifications:', JSON.stringify(parsed, null, 2));

    console.log('\nTesting generate-skills with meta/llama-3.1-8b-instruct...');
    const startTime2 = Date.now();
    const { prompt: skillPrompt } = buildLegacyPrompt('generate-skills', {
        jobTitle: 'Full Stack Software Engineer',
        workHistory: 'Senior Developer at Tech Corp'
    });
    const skillRes = await generateWithProviders({ prompt: skillPrompt, configuration: config, operation: 'generate-skills' });
    const elapsed2 = Date.now() - startTime2;
    console.log(`generate-skills completed in ${elapsed2}ms!`);
    const parsedSkills = parseAiResponse('generate-skills', skillRes.raw);
    console.log('Parsed Skills:', JSON.stringify(parsedSkills, null, 2));
}
test().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
"""

with sftp.file('/home/u727965524/test_llama_ops.js', 'w') as f:
    f.write(test_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && export NODE_PATH=/home/u727965524/backend/node_modules && cd /home/u727965524/backend && node /home/u727965524/test_llama_ops.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
ssh.close()
