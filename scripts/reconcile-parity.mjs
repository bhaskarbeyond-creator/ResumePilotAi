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
const MySQLRepository = require('./repositories/MySQLRepository');

async function syncAllParity() {
    const pool = getPool();
    const mysqlRepo = new MySQLRepository();

    // 1. Sync all resumes from Firestore to MySQL
    const usersSnap = await firestoreDb.collection('users').get();
    for (const uDoc of usersSnap.docs) {
        const uId = uDoc.id;
        const uData = uDoc.data();
        await mysqlRepo.saveUser(uId, { id: uId, ...uData });

        const resSnap = await firestoreDb.collection('users').doc(uId).collection('resumes').get();
        for (const rDoc of resSnap.docs) {
            const rId = rDoc.id;
            const rData = rDoc.data();
            await mysqlRepo.saveResume(uId, rId, rData);
        }

        const portSnap = await firestoreDb.collection('users').doc(uId).collection('portfolios').get();
        for (const pDoc of portSnap.docs) {
            const pId = pDoc.id;
            const pData = pDoc.data();
            await mysqlRepo.savePortfolio(uId, pId, pData);
        }
    }

    console.log('Parity sync completed.');
    process.exit(0);
}

syncAllParity().catch(console.error);
`;

fs.writeFileSync('scripts/remote_sync_parity.js', code);
execSync('scp -o BatchMode=yes scripts/remote_sync_parity.js airesume:~/backend/remote_sync_parity.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_sync_parity.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_sync_parity.js"');
fs.unlinkSync('scripts/remote_sync_parity.js');
