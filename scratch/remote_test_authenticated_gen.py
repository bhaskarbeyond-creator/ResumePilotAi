import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('82.112.232.112', port=65002, username='u727965524', key_filename=r'C:\Users\mbhas\.ssh\id_ed25519')

remote_code = r"""
require('dotenv').config();
const admin = require('./services/firebaseAdmin');

const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

if (clientEmail && privateKey) {
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }), projectId });
} else {
    admin.initializeApp({ projectId });
}

const http = require('http');

async function testWithToken() {
    // Generate a valid custom token for testing
    const customToken = await admin.auth().createCustomToken('OhZdiSIFL7ePA1TMkfu9bnR935D3', { role: 'ADMIN', email_verified: true });
    
    // Exchange custom token for ID token via REST API using Firebase Web API key or server-side auth
    console.log('Testing generate-summary with Firebase Auth token...');
    
    const { generateWithProviders, loadProviderConfiguration } = require('./services/aiRuntime');
    const db = admin.firestore();
    const config = await loadProviderConfiguration(db);
    
    console.log('Active Primary Provider:', config.provider);
    console.log('NVIDIA Model:', config.providers.nvidia?.model);
    console.log('NVIDIA Key Configured:', Boolean(config.providers.nvidia?.key));

    const res = await generateWithProviders({
        prompt: 'Generate a professional 2-sentence summary for a Senior Software Engineer with 8 years of React and Node.js experience.',
        configuration: config,
        operation: 'generate-summary'
    });

    console.log('\n✅ AI GENERATION SUCCESS!');
    console.log('Provider used:', res.provider);
    console.log('Model used:', res.model);
    console.log('Generated Text:', res.raw);
    process.exit(0);
}

testWithToken().catch(e => { console.error('❌ Error:', e); process.exit(1); });
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/scratch_test_token_gen.js', 'w') as f:
    f.write(remote_code)

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'
stdin, stdout, stderr = ssh.exec_command(f'{node_env} && cd /home/u727965524/backend && node scratch_test_token_gen.js')
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

try: sftp.remove('/home/u727965524/backend/scratch_test_token_gen.js')
except Exception: pass
ssh.close()
