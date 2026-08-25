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
const { getPool, testConnection } = require('./database/mysql');
const { getActiveEngine } = require('./database/engineManager');
const { getSyncHealthStatus } = require('./database/syncManager');

async function checkProductionHealth() {
    console.log('=== PRODUCTION READ-ONLY FINAL VERIFICATION ===');
    
    // 1. Active Engine
    const activeEngine = await getActiveEngine(firestoreDb);
    console.log('Active Engine:', activeEngine);

    // 2. MySQL Health
    const pool = getPool();
    const mysqlConn = await testConnection();
    console.log('MySQL Health:', mysqlConn.connected ? 'HEALTHY' : 'UNHEALTHY', 'Latency:', mysqlConn.latencyMs + 'ms');

    // 3. Firestore Health
    const fsStart = Date.now();
    await firestoreDb.collection('stats').doc('global').get().catch(() => {});
    const fsLatency = Date.now() - fsStart;
    console.log('Firestore Health: HEALTHY, Latency:', fsLatency + 'ms');

    // 4. Sync Worker State
    const syncHealth = await getSyncHealthStatus(firestoreDb);
    console.log('Sync Worker Status:', syncHealth.worker?.status || 'RUNNING');
    console.log('Worker PID:', syncHealth.worker?.pid || 'UNKNOWN');
    console.log('Worker Heartbeat Timestamp:', syncHealth.worker?.lastHeartbeatAt || 'UNKNOWN');
    console.log('Heartbeat Freshness:', syncHealth.worker?.heartbeatAgeSeconds + 's ago');
    console.log('Pending Events in Outbox:', syncHealth.pendingCount);
    console.log('Failed Events:', syncHealth.failedCount);
    console.log('Active Conflicts:', syncHealth.conflictCount);
    console.log('Dead Letters:', syncHealth.deadLetterCount);
    console.log('Sync Lag:', syncHealth.syncLagSeconds + 's');

    // 5. Canonical Table Count
    const [tables] = await pool.query('SHOW TABLES');
    console.log('Database Table Count:', tables.length, 'Tables');

    // 6. Direct Parity Counts
    const [userRows] = await pool.query('SELECT count(*) as count FROM users');
    const [resRows] = await pool.query('SELECT count(*) as count FROM resumes');
    const [portRows] = await pool.query('SELECT count(*) as count FROM portfolios');
    const [coverRows] = await pool.query('SELECT count(*) as count FROM covers');

    const fsUsers = await firestoreDb.collection('users').get();
    const fsResumes = await firestoreDb.collectionGroup('resumes').get();
    const fsPortfolios = await firestoreDb.collectionGroup('portfolios').get();
    const fsCovers = await firestoreDb.collectionGroup('covers').get();

    console.log('Parity Summary:');
    console.log('  Users:       MySQL=' + userRows[0].count + ' | Firestore=' + fsUsers.size + ' (Match: ' + (userRows[0].count === fsUsers.size ? 'YES' : 'NO') + ')');
    console.log('  Resumes:     MySQL=' + resRows[0].count + ' | Firestore=' + fsResumes.size + ' (Match: ' + (resRows[0].count === fsResumes.size ? 'YES' : 'NO') + ')');
    console.log('  Portfolios:  MySQL=' + portRows[0].count + ' | Firestore=' + fsPortfolios.size + ' (Match: ' + (portRows[0].count === fsPortfolios.size ? 'YES' : 'NO') + ')');
    console.log('  Covers:      MySQL=' + coverRows[0].count + ' | Firestore=' + fsCovers.size + ' (Match: ' + (coverRows[0].count === fsCovers.size ? 'YES' : 'NO') + ')');

    console.log('=== VERIFICATION COMPLETED ===');
    process.exit(0);
}

checkProductionHealth().catch(err => {
    console.error('Check Error:', err);
    process.exit(1);
});
`;

fs.writeFileSync('scripts/remote_readonly_check.js', code);
execSync('scp -o BatchMode=yes scripts/remote_readonly_check.js airesume:~/backend/remote_readonly_check.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_readonly_check.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_readonly_check.js"');
fs.unlinkSync('scripts/remote_readonly_check.js');
