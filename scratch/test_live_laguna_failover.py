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
const { executeContentOperation } = require("/home/u727965524/backend/services/aiRuntime");
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
    console.log("Testing executeContentOperation with poolside/laguna-xs-2.1 configured...");
    const s = Date.now();
    const res = await executeContentOperation({
        operation: "generate-summary",
        payload: { occupation: "Lead Software Architect", workExperiences: [{ jobTitle: "Lead Architect" }] },
        db,
        environment: { ...process.env, NVIDIA_MODEL: "poolside/laguna-xs-2.1" },
        fetchImpl: fetch,
        requestId: "test_laguna_failover"
    });
    console.log("Completed in " + (Date.now() - s) + "ms! Model used: " + res.model + ", Data length: " + (res.data?.summary || "").length);
}
run().then(() => process.exit(0)).catch(e => { console.error("Error:", e); process.exit(1); });
'
"""

stdin, stdout, stderr = ssh.exec_command(test_cmd)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
