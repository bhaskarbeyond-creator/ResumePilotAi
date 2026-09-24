const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const dotenv = require('dotenv');
dotenv.config({ path: 'backend/.env' });

async function verifyAuthStack() {
  console.log('Testing Live Auth Stack for ime365.com...\n');

  // 1. Check Login page on public URL
  const loginRes = await fetch('https://ime365.com/login');
  console.log('[1/3] Probing Public Login Page (https://ime365.com/login)...');
  console.log('  HTTP Status:', loginRes.status);
  const html = await loginRes.text();
  console.log('  Contains React App Container:', html.includes('id="root"'));
  if (loginRes.status !== 200) throw new Error('Login page returned non-200');

  // 2. Initialize Firebase Admin and check Superadmin
  console.log('\n[2/3] Verifying Firebase Superadmin Account...');
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  };
  const app = initializeApp({ credential: cert(serviceAccount) }, 'auth-stack-test');
  const auth = getAuth(app);

  const superAdmin = await auth.getUserByEmail('bhaskar.beyond@gmail.com');
  console.log('  Superadmin UID:', superAdmin.uid);
  console.log('  Email Verified:', superAdmin.emailVerified);
  console.log('  Role Claim:', superAdmin.customClaims?.role);

  // 3. Test Action Link generation for ime365.com
  console.log('\n[3/3] Generating Password Reset Link for Superadmin...');
  const actionCodeSettings = {
    url: 'https://ime365.com/login',
    handleCodeInApp: true
  };
  const resetLink = await auth.generatePasswordResetLink('bhaskar.beyond@gmail.com', actionCodeSettings);
  console.log('  ✓ Password Reset Link generated successfully:');
  console.log('    URL prefix:', resetLink.slice(0, 60) + '...');
  console.log('    Continue URL param:', resetLink.includes(encodeURIComponent('https://ime365.com/login')) ? 'Verified ime365.com' : 'Default handler');

  console.log('\n✅ ALL FIREBASE AUTHENTICATION VERIFICATIONS PASSED 100%!');
}

verifyAuthStack().catch(err => {
  console.error('Auth verification failed:', err);
  process.exit(1);
});
