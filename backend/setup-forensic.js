require('dotenv').config();
const admin = require('./services/firebaseAdmin');

const email = String(process.env.FORENSIC_ADMIN_EMAIL || '').trim();
const password = String(process.env.FORENSIC_ADMIN_PASSWORD || '');
if (!email || !password) {
    throw new Error('Set FORENSIC_ADMIN_EMAIL and FORENSIC_ADMIN_PASSWORD in the environment; credentials are never embedded in this script.');
}
if (password.length < 12) throw new Error('FORENSIC_ADMIN_PASSWORD must meet the production password policy.');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        })
    });
}

async function run() {
    let user;
    try {
        user = await admin.auth().getUserByEmail(email);
        await admin.auth().updateUser(user.uid, { password });
    } catch (error) {
        if (error?.code !== 'auth/user-not-found') throw error;
        user = await admin.auth().createUser({ email, password, emailVerified: true });
    }
    await admin.auth().setCustomUserClaims(user.uid, { role: 'SUPER_ADMIN' });
    await admin.firestore().collection('users').doc(user.uid).set({
        email,
        role: 'SUPER_ADMIN',
        firstName: 'Forensic',
        lastName: 'Admin'
    }, { merge: true });
    console.log('Forensic Super Admin provisioned.');
}
run().catch(error => {
    console.error('Forensic admin provisioning failed:', error.message);
    process.exitCode = 1;
});
