require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
};
initializeApp({ credential: cert(serviceAccount) });
async function run() {
  const email = 'bhaskar.beyond@gmail.com';
  const user = await getAuth().getUserByEmail(email);
  console.log('Claims for', email, user.customClaims);
  await getAuth().setCustomUserClaims(user.uid, { role: 'SUPER_ADMIN' });
  console.log('Set SUPER_ADMIN for', email);

  const adminEmail = 'admin@resumepilot.ai';
  let adminUser;
  try {
    adminUser = await getAuth().getUserByEmail(adminEmail);
  } catch (e) {
    adminUser = await getAuth().createUser({ email: adminEmail, password: 'superpassword123', emailVerified: true });
    console.log('Created user', adminEmail);
  }
  await getAuth().setCustomUserClaims(adminUser.uid, { role: 'ADMIN' });
  console.log('Set ADMIN for', adminEmail);
}
run();
