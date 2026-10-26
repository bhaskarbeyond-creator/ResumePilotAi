require('dotenv').config();
const admin = require('./services/firebaseAdmin');

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
    let u;
    try {
        u = await admin.auth().getUserByEmail('forensic@projectdemo.guru');
        await admin.auth().updateUser(u.uid, {password: 'Forensic@2026!'});
    } catch(e) {
        u = await admin.auth().createUser({email: 'forensic@projectdemo.guru', password: 'Forensic@2026!', emailVerified: true});
    }
    await admin.auth().setCustomUserClaims(u.uid, {role: 'SUPER_ADMIN'});
    await admin.firestore().collection('users').doc(u.uid).set({
        email: 'forensic@projectdemo.guru',
        role: 'SUPER_ADMIN',
        firstName: 'Forensic',
        lastName: 'Admin'
    }, {merge: true});
    console.log('Done');
}
run().catch(console.error);
