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

console.log('Testing /api/generate-interview with live Superadmin Auth token...');
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
  console.log("Superadmin UID:", superAdmin.uid);

  // Mint a custom token
  const customToken = await auth.createCustomToken(superAdmin.uid, { role: "SUPER_ADMIN" });
  
  // Exchange for ID token via Google Identity Toolkit
  const webApiKey = "AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc";
  const tokenRes = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" + webApiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.idToken) {
    throw new Error("Failed to get ID token: " + JSON.stringify(tokenData));
  }
  console.log("Obtained live ID token for superadmin.");

  // 1. Call POST /api/generate-interview
  console.log("\\n[Test 1] Calling POST /api/generate-interview (port 8080)...");
  const start = Date.now();
  const res = await fetch("http://127.0.0.1:8080/api/generate-interview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + tokenData.idToken
    },
    body: JSON.stringify({
      occupation: "Full Stack Developer",
      interviewType: "technical",
      questionCount: 5,
      language: "en"
    })
  });
  const elapsed = Date.now() - start;
  const body = await res.text();
  console.log("HTTP Status:", res.status, "in " + elapsed + "ms");
  console.log("Response Preview:", body.slice(0, 500));

  // 2. Call POST /api/live-interview/sessions
  console.log("\\n[Test 2] Calling POST /api/live-interview/sessions (port 8080)...");
  const liveStart = Date.now();
  const liveRes = await fetch("http://127.0.0.1:8080/api/live-interview/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + tokenData.idToken
    },
    body: JSON.stringify({
      role: "Full Stack Developer",
      interviewType: "technical",
      durationMinutes: 15,
      difficulty: "medium"
    })
  });
  const liveElapsed = Date.now() - liveStart;
  const liveBody = await liveRes.text();
  console.log("Live Session HTTP Status:", liveRes.status, "in " + liveElapsed + "ms");
  console.log("Live Session Preview:", liveBody.slice(0, 500));

  process.exit(0);
}
main().catch(e => { console.error("Fatal:", e); process.exit(1); });
'
`;

console.log(runSsh(remoteScript));
