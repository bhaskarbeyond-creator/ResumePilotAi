import admin from 'firebase-admin';
import 'dotenv/config';

/**
 * Provision a temporary administrator for a local/live certification run.
 * All credentials come from the process environment and are never printed.
 * Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
 *           FORENSIC_ADMIN_EMAIL, FORENSIC_ADMIN_PASSWORD
 */
const required = name => {
    const value = String(process.env[name] || '').trim();
    if (!value) throw new Error(`${name} is required; set it in the shell, never in source.`);
    return value;
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: required('FIREBASE_PROJECT_ID'),
            clientEmail: required('FIREBASE_CLIENT_EMAIL'),
            privateKey: required('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
    });
}

const db = admin.firestore();
const auth = admin.auth();

async function provision() {
    const email = required('FORENSIC_ADMIN_EMAIL').toLowerCase();
    const credential = required('FORENSIC_ADMIN_PASSWORD');
    let user;

    try {
        user = await auth.getUserByEmail(email);
        console.log(`User ${email} already exists with UID: ${user.uid}`);
        await auth.updateUser(user.uid, { password: credential });
    } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
        user = await auth.createUser({ email, password: credential, emailVerified: true, displayName: 'Forensic Test Admin' });
        console.log(`Created user ${email} with UID: ${user.uid}`);
    }

    await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), role: 'SUPER_ADMIN' });
    await db.collection('users').doc(user.uid).set({
        userId: user.uid,
        email,
        firstname: 'Forensic',
        lastname: 'Test',
        role: 'SUPER_ADMIN',
        authProvider: 'password',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        emailVerified: true,
    }, { merge: true });
    console.log(`Provisioned SUPER_ADMIN ${email} (${user.uid}); secret value was not logged.`);
}

provision().catch(error => {
    console.error('Provision failed:', error.message);
    process.exitCode = 1;
});
