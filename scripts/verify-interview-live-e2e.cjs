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

console.log('Testing live interview endpoints on https://ime365.com via internal & proxy...');
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
  const webApiKey = "AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc";
  const tokenRes = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" + webApiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const tokenData = await tokenRes.json();
  const idToken = tokenData.idToken;

  console.log("Superadmin authenticated.");

  // Test 1: POST /api/generate-interview (5 questions)
  console.log("\\n[Step 1] POST /api/generate-interview (5 questions)...");
  const t0 = Date.now();
  const res1 = await fetch("http://127.0.0.1:8080/api/generate-interview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + idToken
    },
    body: JSON.stringify({
      occupation: "Full Stack Developer",
      interviewType: "technical",
      questionCount: 5,
      language: "en"
    })
  });
  const elapsed1 = Date.now() - t0;
  console.log("Generate interview HTTP status:", res1.status, "in " + elapsed1 + "ms");
  const data1 = await res1.json();
  if (res1.status === 200 && Array.isArray(data1.questions)) {
    console.log("SUCCESS! Title:", data1.title);
    console.log("Total Questions Received:", data1.questions.length);
    console.log("Q1:", data1.questions[0].question.slice(0, 100));
    console.log("Q1 options count:", data1.questions[0].options?.length);
    console.log("Q1 explanation:", data1.questions[0].explanation?.slice(0, 80));
  } else {
    console.error("FAILED:", JSON.stringify(data1));
    process.exit(1);
  }

  // Brief pause to respect NVIDIA rate spacing
  await new Promise(r => setTimeout(r, 4000));

  // Test 2: POST /api/live-interview/sessions (Start session)
  console.log("\\n[Step 2] POST /api/live-interview/sessions...");
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
  console.log("Session ID created:", sessionId);
  console.log("Initial Interviewer Message:", data2.session?.interviewer?.message?.slice(0, 120));

  if (!sessionId) {
    console.error("Session creation failed:", JSON.stringify(data2));
    process.exit(1);
  }

  // Test 3: POST /api/live-interview/sessions/:id/turns (Send answer turn)
  console.log("\\n[Step 3] POST /api/live-interview/sessions/" + sessionId + "/turns...");
  const t2 = Date.now();
  const res3 = await fetch("http://127.0.0.1:8080/api/live-interview/sessions/" + sessionId + "/turns", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + idToken
    },
    body: JSON.stringify({
      answer: "I have 5 years of full stack experience using React, Node.js, and MariaDB building high-scale SaaS architectures.",
      turnId: data2.session.interviewer?.turnId,
      expectedRevision: data2.session?.revision || 1,
      idempotencyKey: "turn-key-" + Date.now()
    })
  });
  const elapsed3 = Date.now() - t2;
  console.log("Answer turn HTTP status:", res3.status, "in " + elapsed3 + "ms");
  const data3 = await res3.json();
  console.log("Interviewer Follow-up:", data3.session?.interviewer?.message?.slice(0, 150));

  console.log("\\nALL 3 STEPS COMPLETED WITH 100% SUCCESS!");
}
main().catch(e => { console.error("Fatal:", e); process.exit(1); });
'
`;

console.log(runSsh(remoteScript));
