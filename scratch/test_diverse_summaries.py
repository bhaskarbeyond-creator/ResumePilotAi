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

test_cmd = r"""
export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH
export NODE_PATH=/home/u727965524/backend/node_modules
node -e '
require("dotenv").config({ path: "/home/u727965524/backend/.env" });
const fetch = require("node-fetch");
const { executeContentOperation } = require("/home/u727965524/backend/services/aiRuntime");
const admin = require("/home/u727965524/backend/services/firebaseAdmin");

const testCases = [
    {
        role: "Senior Full-Stack Engineer",
        payload: {
            occupation: "Senior Full-Stack Engineer",
            jobTitle: "Senior Full-Stack Engineer",
            experience: "7+ years",
            skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "AWS", "Docker"],
            workExperiences: [{ jobTitle: "Lead Full-Stack Developer", company: "Acme Cloud" }]
        }
    },
    {
        role: "Growth Marketing Manager",
        payload: {
            occupation: "Growth Marketing Manager",
            jobTitle: "Growth Marketing Manager",
            experience: "5 years",
            skills: ["SEO", "Google Analytics", "Paid Acquisition", "HubSpot", "Conversion Rate Optimization"],
            workExperiences: [{ jobTitle: "Digital Marketing Lead", company: "Retail Growth Inc" }]
        }
    },
    {
        role: "Financial Analyst",
        payload: {
            occupation: "Financial Analyst",
            jobTitle: "Financial Analyst",
            experience: "4 years",
            skills: ["Financial Modeling", "Excel VBA", "SQL", "Forecasting", "Variance Analysis", "Bloomberg Terminal"],
            workExperiences: [{ jobTitle: "Junior Analyst", company: "Global Investments" }]
        }
    }
];

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
    console.log("=== Testing Natural & ATS Output for 3 Diverse Roles ===\n");
    for (const tc of testCases) {
        const s = Date.now();
        const res = await executeContentOperation({
            operation: "generate-summary",
            payload: tc.payload,
            db,
            environment: process.env,
            fetchImpl: fetch,
            requestId: "test_natural"
        });
        console.log("-----------------------------------------");
        console.log("Role: " + tc.role + " (" + (Date.now() - s) + "ms)");
        console.log("Summary: " + res.data?.summary);
    }
}
run().then(() => process.exit(0)).catch(e => { console.error("Error:", e); process.exit(1); });
'
"""

stdin, stdout, stderr = ssh.exec_command(test_cmd)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
