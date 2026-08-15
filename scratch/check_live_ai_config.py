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

const { loadProviderConfiguration, generateWithProviders, executeContentOperation } = require('./services/aiRuntime');

async function test() {
    console.log('Testing loadProviderConfiguration...');
    const config = await loadProviderConfiguration(db);
    console.log('Active provider:', config.provider);
    console.log('Configured providers in config:', Object.keys(config.providers || {}));
    for (const [p, c] of Object.entries(config.providers || {})) {
        console.log(`- Provider [${p}]: hasKey=${!!c.apiKey}, model=${c.model}`);
    }

    console.log('\\nTesting executeContentOperation for generate-summary...');
    try {
        const result = await executeContentOperation({
            operation: 'generate-summary',
            payload: {
                name: 'John Doe',
                jobTitle: 'Full Stack Engineer',
                experience: '5 years of experience',
                skills: 'React, Node.js, TypeScript',
                achievement: 'Built high scale APIs',
                summaryType: 'executive',
                tone: 'executive',
                language: 'en'
            },
            db: db
        });
        console.log('SUCCESS! Result:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('FAILED! Error:', err.message, 'Code:', err.code, 'Status:', err.status);
        console.error(err.stack);
    }
    process.exit(0);
}

test().catch(e => { console.error('Unhandled test error:', e); process.exit(1); });
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/scratch_check_ai.js', 'w') as f:
    f.write(remote_script)

stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && cd /home/u727965524/backend && node scratch_check_ai.js')
print(stdout.read().decode('utf-8', errors='replace'))
print(stderr.read().decode('utf-8', errors='replace'))
ssh.close()
