require('dotenv').config({ path: 'backend/.env' });
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
};
initializeApp({ credential: cert(serviceAccount) });

async function run() {
  const userEmail = process.env.SEED_USER_EMAIL || 'user@resumepilot.ai';
  // A seeded account must never receive a hardcoded password: the value would
  // live in version control forever. Require the operator to supply one.
  const userPassword = process.env.SEED_USER_PASSWORD;
  if (!userPassword || userPassword.length < 10) {
    console.error('Set SEED_USER_PASSWORD (min 10 chars) in the environment before seeding a user.');
    process.exit(1);
  }
  let user;
  try {
    user = await getAuth().getUserByEmail(userEmail);
  } catch (e) {
    user = await getAuth().createUser({ email: userEmail, password: userPassword, emailVerified: true });
    console.log('Created user', userEmail);
  }
  await getAuth().setCustomUserClaims(user.uid, { role: 'USER' }); // No special role
  console.log('Set USER for', userEmail);
}
run();
