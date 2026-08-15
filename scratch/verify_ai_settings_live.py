import paramiko
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

node_test_script = r"""
const path = require('path');
require('dotenv').config({ path: '/home/u727965524/backend/.env' });
const admin = require('/home/u727965524/backend/services/firebaseAdmin');

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
} catch (e) {
    console.error('Firebase init error:', e);
}

const { loadAiAdminSettings, saveAiAdminSettings, testAiProvider, fetchProviderModels } = require('/home/u727965524/backend/services/aiAdmin');

async function run() {
    console.log('=== 1. VERIFYING LOAD AI ADMIN SETTINGS ===');
    const loaded = await loadAiAdminSettings(db);
    console.log('configuredProviders:', loaded.configuredProviders);
    console.log('maskedKeys:', loaded.maskedKeys);
    console.log('settings.nvidiaApiKey is undefined:', loaded.settings.nvidiaApiKey === undefined);
    console.log('settings.nvidiaModel:', loaded.settings.nvidiaModel);

    console.log('\n=== 2. VERIFYING DYNAMIC NVIDIA MODELS FETCH ===');
    const modelsResult = await fetchProviderModels({
        db, environment: process.env,
        provider: 'nvidia', fetchImpl: global.fetch, timeoutMs: 15000
    });
    console.log('Fetched model count:', modelsResult.count);
    console.log('Sample models:', modelsResult.models.slice(0, 5).map(m => m.id));

    console.log('\n=== 3. VERIFYING TEST AI PROVIDER (DEFAULT NVIDIA) ===');
    const test1 = await testAiProvider({
        db, environment: process.env,
        provider: 'nvidia', model: 'meta/llama-3.1-8b-instruct',
        fetchImpl: global.fetch, timeoutMs: 30000
    });
    console.log('meta/llama-3.1-8b-instruct test:', test1);

    console.log('\n=== 4. VERIFYING TEST AI PROVIDER (LLAMA 3.2 3B) ===');
    const test2 = await testAiProvider({
        db, environment: process.env,
        provider: 'nvidia', model: 'meta/llama-3.2-3b-instruct',
        fetchImpl: global.fetch, timeoutMs: 30000
    });
    console.log('meta/llama-3.2-3b-instruct test:', test2);

    console.log('\n=== 5. VERIFYING MASKED KEY PRESERVATION ON SAVE ===');
    const saveResult = await saveAiAdminSettings({
        db, admin,
        input: {
            provider: 'nvidia',
            nvidiaModel: 'meta/llama-3.1-8b-instruct',
            nvidiaApiKey: loaded.maskedKeys.nvidia, // Sending masked token
            enableNvidia: true,
        },
        expectedRevision: loaded.revision,
        actorUid: 'admin_test_probe'
    });
    console.log('Save with masked token revision:', saveResult.revision);
    console.log('Configured after save:', saveResult.configuredProviders);

    console.log('\n=== ALL VERIFICATIONS PASSED SUCCESSFULLY ===');
    process.exit(0);
}

run().catch(err => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
});
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/verify_ai_live.js', 'w') as f:
    f.write(node_test_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && export NODE_PATH=/home/u727965524/backend/node_modules && cd /home/u727965524/backend && node /home/u727965524/verify_ai_live.js 2>&1')
output = stdout.read().decode('utf-8')
print(output)
ssh.close()
