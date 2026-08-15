import paramiko
import sys
import json
import time

sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

test_cmd = r"""
export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH
export NODE_PATH=/home/u727965524/backend/node_modules
node -e '
require("dotenv").config({ path: "/home/u727965524/backend/.env" });
const fetch = require("node-fetch");
const { executeContentOperation, loadProviderConfiguration } = require("/home/u727965524/backend/services/aiRuntime");
const { testAiProvider, fetchProviderModels } = require("/home/u727965524/backend/services/aiAdmin");
const admin = require("/home/u727965524/backend/services/firebaseAdmin");

async function run() {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
            })
        });
    }
    const db = admin.firestore();
    
    console.log("==================================================");
    console.log("   1. LIVE CONFIGURATION & CREDENTIAL AUDIT");
    console.log("==================================================");
    const config = await loadProviderConfiguration(db, process.env);
    console.log("Primary Provider:", config.primary);
    console.log("Enable Fallback:", config.enableFallback);
    console.log("Temperature:", config.temperature);
    console.log("Max Tokens:", config.maxTokens);
    for (const [p, pcfg] of Object.entries(config.providers)) {
        console.log(`- ${p.toUpperCase().padEnd(11)}: Enabled=${pcfg.enabled}, Model=${pcfg.model}, HasKey=${Boolean(pcfg.key)}`);
    }

    console.log("\n==================================================");
    console.log("   2. LIVE NVIDIA HEALTH & OPERATION BENCHMARKS");
    console.log("==================================================");
    const operations = [
        { op: "generate-summary", payload: { occupation: "Senior SRE", jobTitle: "Senior SRE", experience: "6 years", skills: ["Kubernetes", "Terraform", "Prometheus"], tone: "technical" } },
        { op: "generate-work-description", payload: { jobTitle: "DevOps Lead", employer: "CloudCorp", focusTone: "technical", existingText: "Managed Kubernetes infrastructure" } },
        { op: "generate-education-description", payload: { degree: "BS Computer Science", school: "Stanford" } },
        { op: "generate-skills", payload: { occupation: "Full Stack Engineer" } },
        { op: "generate-certifications", payload: { occupation: "Cloud Architect" } },
        { op: "enhance-single-bullet", payload: { text: "worked on optimizing database queries" } },
        { op: "autocomplete", payload: { type: "jobTitle", query: "Full" } }
    ];

    let nvidiaSuccessCount = 0;
    for (const item of operations) {
        const start = Date.now();
        try {
            const res = await executeContentOperation({
                operation: item.op,
                payload: item.payload,
                db,
                environment: process.env,
                fetchImpl: fetch,
                requestId: "audit_" + item.op
            });
            const latency = Date.now() - start;
            console.log(`[PASS] ${item.op.padEnd(30)} -> ${latency}ms | output length=${JSON.stringify(res.data).length} chars`);
            nvidiaSuccessCount++;
        } catch (e) {
            console.error(`[FAIL] ${item.op.padEnd(30)} -> Error: ${e.message}`);
        }
    }
    console.log(`\nNVIDIA Operations Score: ${nvidiaSuccessCount} / ${operations.length} Passing`);

    console.log("\n==================================================");
    console.log("   3. LIVE PROVIDER TEST & MODEL DISCOVERY AUDIT");
    console.log("==================================================");
    // Test NVIDIA model discovery
    try {
        const modelsRes = await fetchProviderModels({ db, provider: "nvidia", fetchImpl: fetch });
        console.log(`[PASS] NVIDIA Model Discovery: Fetched ${modelsRes.count} live models`);
    } catch (e) {
        console.error(`[FAIL] NVIDIA Model Discovery: ${e.message}`);
    }

    // Test NVIDIA provider ping
    try {
        const testRes = await testAiProvider({ db, provider: "nvidia", fetchImpl: fetch });
        console.log(`[PASS] NVIDIA Provider Ping: ${testRes.message}`);
    } catch (e) {
        console.error(`[FAIL] NVIDIA Provider Ping: ${e.message}`);
    }

    // Test other unconfigured providers for correct fail-closed error handling
    for (const provider of ["gemini", "openai", "groq", "openrouter", "deepseek"]) {
        try {
            await testAiProvider({ db, provider, fetchImpl: fetch });
            console.log(`[WARN] ${provider} ping succeeded unexpectedly without credentials`);
        } catch (e) {
            console.log(`[PASS] ${provider.toUpperCase().padEnd(11)} unconfigured check -> HTTP ${e.status || 400}: ${e.message}`);
        }
    }
}
run().then(() => process.exit(0)).catch(e => { console.error("FATAL:", e); process.exit(1); });
'
"""

stdin, stdout, stderr = ssh.exec_command(test_cmd)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
