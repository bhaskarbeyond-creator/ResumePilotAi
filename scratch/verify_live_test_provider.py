import paramiko
import os
import sys

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
const { testAiProvider } = require("/home/u727965524/backend/services/aiAdmin");
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
    console.log("Testing live testAiProvider for NVIDIA with meta/llama-3.1-8b-instruct...");
    const s = Date.now();
    const res = await testAiProvider({
        db,
        environment: process.env,
        provider: "nvidia",
        model: "meta/llama-3.1-8b-instruct",
        apiKey: "",
        fetchImpl: fetch,
        timeoutMs: 30000
    });
    console.log("Result in " + (Date.now() - s) + "ms:", JSON.stringify(res));
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
'
"""

stdin, stdout, stderr = ssh.exec_command(test_cmd)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
