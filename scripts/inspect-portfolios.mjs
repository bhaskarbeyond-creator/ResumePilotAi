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

async function inspectPortfolios() {
    const pool = getPool();
    const fsPorts = await firestoreDb.collectionGroup('portfolios').get();
    console.log('Firestore Portfolios:');
    for (const d of fsPorts.docs) {
        console.log('  Doc ID:', d.id, 'Path:', d.ref.path, 'Data:', d.data());
    }

    const [mysqlPorts] = await pool.query('SELECT * FROM portfolios');
    console.log('\\nMySQL Portfolios:');
    for (const p of mysqlPorts) {
        console.log('  Row ID:', p.id, 'User ID:', p.user_id, 'Title:', p.title);
    }
    process.exit(0);
}

inspectPortfolios().catch(console.error);
`;

fs.writeFileSync('scripts/remote_inspect_portfolios.js', code);
execSync('scp -o BatchMode=yes scripts/remote_inspect_portfolios.js airesume:~/backend/remote_inspect_portfolios.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_inspect_portfolios.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_inspect_portfolios.js"');
fs.unlinkSync('scripts/remote_inspect_portfolios.js');
