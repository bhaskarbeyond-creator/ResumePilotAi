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
  const userEmail = 'user@resumepilot.ai';
  let user;
  try {
    user = await getAuth().getUserByEmail(userEmail);
  } catch (e) {
    user = await getAuth().createUser({ email: userEmail, password: 'superpassword123', emailVerified: true });
    console.log('Created user', userEmail);
  }
  await getAuth().setCustomUserClaims(user.uid, { role: 'USER' }); // No special role
  console.log('Set USER for', userEmail);
}
run();
