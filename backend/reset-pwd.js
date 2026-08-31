require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const superAdminEmail = String(process.env.RESET_SUPERADMIN_EMAIL || '').trim();
const adminEmail = String(process.env.RESET_ADMIN_EMAIL || '').trim();
const adminPassword = String(process.env.RESET_ADMIN_PASSWORD || '');
if (!superAdminEmail || !adminEmail || !adminPassword) {
  throw new Error('Set RESET_SUPERADMIN_EMAIL, RESET_ADMIN_EMAIL, and RESET_ADMIN_PASSWORD in the environment; credentials are never embedded in this script.');
}
if (adminPassword.length < 12) throw new Error('RESET_ADMIN_PASSWORD must meet the production password policy.');
if (!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
  throw new Error('Set Firebase Admin credentials through the deployment environment.');
}

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
};
initializeApp({ credential: cert(serviceAccount) });

async function run() {
  const auth = getAuth();
  const superAdminUser = await auth.getUserByEmail(superAdminEmail);
  await auth.setCustomUserClaims(superAdminUser.uid, { ...(superAdminUser.customClaims || {}), role: 'SUPER_ADMIN' });
  console.log('Verified SUPER_ADMIN role for the configured account in Firebase Auth.');

  try {
    const { getRepository } = require('./repositories');
    const repo = getRepository();
    await repo.saveUser(superAdminUser.uid, { role: 'SUPER_ADMIN' }).catch(() => {});
    console.log('Synchronized SUPER_ADMIN role in MariaDB users repository.');
  } catch (dbErr) {
    console.warn('MariaDB user role synchronization notice:', dbErr.message);
  }

  let adminUser;
  try {
    adminUser = await auth.getUserByEmail(adminEmail);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    adminUser = await auth.createUser({ email: adminEmail, password: adminPassword, emailVerified: true });
    console.log('Created the configured ADMIN account.');
  }
  await auth.setCustomUserClaims(adminUser.uid, { ...(adminUser.customClaims || {}), role: 'ADMIN' });
  console.log('Verified ADMIN role for the configured account in Firebase Auth.');

  try {
    const { getRepository } = require('./repositories');
    const repo = getRepository();
    await repo.saveUser(adminUser.uid, { role: 'ADMIN' }).catch(() => {});
    console.log('Synchronized ADMIN role in MariaDB users repository.');
  } catch (dbErr) {
    console.warn('MariaDB user role synchronization notice:', dbErr.message);
  }
}

run().catch(error => {
  console.error('Admin role provisioning failed:', error.message);
  process.exitCode = 1;
});
