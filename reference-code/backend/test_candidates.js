
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

const db = admin.firestore();
const { loadProviderConfiguration } = require('./services/aiRuntime');

async function run() {
    const config = await loadProviderConfiguration(db);
    const key = config.providers.nvidia?.key;

    const candidates = [
        'meta/llama-3.1-8b-instruct',
        'poolside/laguna-xs-2.1',
        'mistralai/mistral-7b-instruct-v0.3',
        'nv-mistralai/mistral-nemo-12b-instruct',
        'nvidia/mistral-nemo-minitron-8b-8k-instruct',
        'meta/llama-3.2-3b-instruct',
        'meta/llama-3.2-1b-instruct',
        'google/gemma-2b',
        'ibm/granite-3.0-8b-instruct',
        'deepseek-ai/deepseek-v4-flash-0731'
    ];

    for (const m of candidates) {
        const start = Date.now();
        try {
            const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: m,
                    messages: [{ role: 'user', content: 'Say OK' }],
                    max_tokens: 5,
                    temperature: 0.1
                })
            });
            const data = await res.json();
            const elapsed = Date.now() - start;
            if (res.ok) {
                console.log(`[PASS] ${m} -> ${elapsed}ms -> ${data.choices?.[0]?.message?.content?.trim()}`);
            } else {
                console.log(`[FAIL] ${m} -> ${elapsed}ms -> HTTP ${res.status}: ${JSON.stringify(data.error || data)}`);
            }
        } catch (e) {
            console.log(`[ERR] ${m} -> ${e.message}`);
        }
    }
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
