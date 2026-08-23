const admin = require('../services/firebaseAdmin');
require('dotenv').config();

// Make sure backend/services/firebase.js logic can be adapted
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        })
    });
}

const db = admin.firestore();
const auth = admin.auth();

async function provision() {
    const email = 'super-test-forensic@projectdemo.guru';
    const password = 'Forensic@2026!';
    let user;

    try {
        user = await auth.getUserByEmail(email);
        console.log(`User ${email} already exists with UID: ${user.uid}`);
        await auth.updateUser(user.uid, { password });
        console.log('Password reset to Forensic@2026!');
    } catch (e) {
        if (e.code === 'auth/user-not-found') {
            user = await auth.createUser({
                email,
                password,
                emailVerified: true,
                displayName: 'Forensic Test Admin'
            });
            console.log(`Created user ${email} with UID: ${user.uid}`);
        } else {
            console.error('Error fetching user:', e);
            process.exit(1);
        }
    }

    // Set custom claims
    await auth.setCustomUserClaims(user.uid, { role: 'SUPER_ADMIN' });
    console.log('Granted SUPER_ADMIN custom claims.');

    // Create firestore document
    await db.collection('users').doc(user.uid).set({
        email,
        firstName: 'Forensic',
        lastName: 'Test',
        role: 'SUPER_ADMIN',
        authProvider: 'password',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        emailVerified: true
    }, { merge: true });

    console.log('Firestore user document verified/created.');
    process.exit(0);
}

provision().catch(e => {
    console.error('Provision failed:', e);
    process.exit(1);
});
