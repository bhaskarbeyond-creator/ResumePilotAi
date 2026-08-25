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

async function listDocs() {
    const pool = getPool();
    const fsRes = await firestoreDb.collectionGroup('resumes').get();
    console.log('Total Firestore Resumes in collectionGroup:', fsRes.size);
    for (const doc of fsRes.docs) {
        const [mysqlRow] = await pool.query('SELECT id, user_id, title FROM resumes WHERE id = ?', [doc.id]);
        if (mysqlRow.length === 0) {
            console.log('MISSING IN MYSQL:', doc.ref.path, doc.id, doc.data());
        }
    }

    const fsPort = await firestoreDb.collectionGroup('portfolios').get();
    console.log('Total Firestore Portfolios in collectionGroup:', fsPort.size);
    for (const doc of fsPort.docs) {
        const [mysqlRow] = await pool.query('SELECT id, user_id FROM portfolios WHERE id = ?', [doc.id]);
        if (mysqlRow.length === 0) {
            console.log('MISSING IN MYSQL PORTFOLIO:', doc.ref.path, doc.id);
        }
    }
    process.exit(0);
}

listDocs().catch(console.error);
`;

fs.writeFileSync('scripts/remote_list_docs.js', code);
execSync('scp -o BatchMode=yes scripts/remote_list_docs.js airesume:~/backend/remote_list_docs.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_list_docs.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_list_docs.js"');
fs.unlinkSync('scripts/remote_list_docs.js');
