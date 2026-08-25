import { execSync } from 'child_process';
import fs from 'fs';

const code = `
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const admin = require('./services/firebaseAdmin');
if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g, '\\n'),
            }),
            projectId
        });
    } else {
        admin.initializeApp({ projectId });
    }
}
const firestoreDb = admin.firestore();
const { getPool } = require('./database/mysql');

async function cleanupProbes() {
    const pool = getPool();

    // 1. Delete test probe users from Firestore
    await firestoreDb.collection('users').doc('usr_auth_live_1787645685591').delete().catch(() => {});
    await firestoreDb.collection('users').doc('usr_auth_live_1787645730148').delete().catch(() => {});

    // 2. Delete test probe users from MySQL
    await pool.query("DELETE FROM users WHERE id IN ('usr_auth_live_1787645685591', 'usr_auth_live_1787645730148')");

    // 3. Add legitimate parent users to Firestore
    await firestoreDb.collection('users').doc('ZEc4XE719BdfxnVPPuuUAMGzo3R2').set({
        email: 'bhaskar@beyond.com',
        displayName: 'Bhaskar Babu',
        role: 'USER',
        updatedAt: new Date()
    }, { merge: true });

    await firestoreDb.collection('users').doc('XSHsFEteFP14qs9r6nDz').set({
        email: 'user@projectdemo.guru',
        displayName: 'Portfolio Owner',
        role: 'USER',
        updatedAt: new Date()
    }, { merge: true });

    console.log('Cleaned up test probe users and synchronized legitimate users.');
    process.exit(0);
}

cleanupProbes().catch(console.error);
`;

fs.writeFileSync('scripts/remote_cleanup_probes.js', code);
execSync('scp -o BatchMode=yes scripts/remote_cleanup_probes.js airesume:~/backend/remote_cleanup_probes.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_cleanup_probes.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_cleanup_probes.js"');
fs.unlinkSync('scripts/remote_cleanup_probes.js');
