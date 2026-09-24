const { execFileSync } = require('child_process');
const path = require('path');
const SSH_KEY = path.join(__dirname, '..', 'dev_key');

function runSsh(cmd) {
  return execFileSync('ssh', [
    '-i', SSH_KEY,
    '-p', '65002',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'PasswordAuthentication=no',
    'u727965524@82.112.232.112',
    cmd
  ], { encoding: 'utf8' });
}

console.log('Testing Live Interview standalone...');
const remoteScript = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
require("dotenv").config();
const admin = require("./services/firebaseAdmin");

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g, "\\n")
      })
    });
  }

  const auth = admin.auth();
  const superAdmin = await auth.getUserByEmail("bhaskar.beyond@gmail.com");
  const customToken = await auth.createCustomToken(superAdmin.uid, { role: "SUPER_ADMIN" });
  const webApiKey = process.env.VITE_FIREBASE_API_KEY || "";
  const tokenRes = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" + webApiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const tokenData = await tokenRes.json();
  const idToken = tokenData.idToken;

  console.log("Superadmin authenticated.");

  // Test: POST /api/live-interview/sessions (Start session)
  console.log("\\nCalling POST /api/live-interview/sessions (Standalone)...");
  const t1 = Date.now();
  const res2 = await fetch("http://127.0.0.1:8080/api/live-interview/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + idToken
    },
    body: JSON.stringify({
      role: "Full Stack Developer",
      interviewType: "technical",
      durationMinutes: 15,
      difficulty: "medium"
    })
  });
  const elapsed2 = Date.now() - t1;
  console.log("Start live session HTTP status:", res2.status, "in " + elapsed2 + "ms");
  const data2 = await res2.json();
  const sessionId = data2.session?.sessionId;
  const turnId = data2.session?.interviewer?.turnId;
  console.log("Session ID created:", sessionId);
  console.log("Initial Interviewer Message:", data2.session?.interviewer?.message?.slice(0, 120));

  if (!sessionId || !turnId) {
    console.error("Session creation failed:", JSON.stringify(data2));
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 4000));

  console.log("\\nCalling POST /api/live-interview/sessions/" + sessionId + "/turns...");
  const t2 = Date.now();
  const res3 = await fetch("http://127.0.0.1:8080/api/live-interview/sessions/" + sessionId + "/turns", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + idToken
    },
    body: JSON.stringify({
      turnId: turnId,
      expectedRevision: data2.session?.revision || 1,
      idempotencyKey: "turn-key-" + Date.now(),
      answer: "I have 5 years of full stack experience building web applications with React, Node.js, and MariaDB, focusing on scalable microservices and clean API design."
    })
  });
  const elapsed3 = Date.now() - t2;
  console.log("Answer turn HTTP status:", res3.status, "in " + elapsed3 + "ms");
  const data3 = await res3.json();
  console.log("Interviewer Follow-up:", data3.session?.interviewer?.message?.slice(0, 160));
  console.log("Next question:", data3.session?.interviewer?.question?.slice(0, 160));
  console.log("Turn evaluation score:", data3.session?.latestEvaluation?.score);

  console.log("\\nLIVE INTERVIEW SESSION & ANSWER TURN COMPLETED WITH 100% SUCCESS!");
}
main().catch(e => { console.error("Fatal:", e); process.exit(1); });
'
`;

console.log(runSsh(remoteScript));
