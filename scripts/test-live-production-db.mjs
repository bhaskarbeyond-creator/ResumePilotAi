import { execSync } from 'child_process';
import fs from 'fs';

const remoteCode = `
const admin = require('./services/firebaseAdmin');
const { getSyncHealthStatus } = require('./database/syncManager');
const { testEngineConnectivity } = require('./database/engineManager');
const { getPool } = require('./database/mysql');

async function testLive() {
  console.log('=== LIVE PRODUCTION BACKEND TEST ===');
  let fsDb = null;
  try {
    fsDb = admin.firestore();
  } catch (_) {}

  const [mysqlConn, firestoreConn, syncHealth] = await Promise.all([
    testEngineConnectivity('mysql'),
    testEngineConnectivity('firestore', fsDb),
    getSyncHealthStatus()
  ]);

  console.log('MariaDB Connected:', mysqlConn.connected, 'Latency:', mysqlConn.latencyMs + 'ms');
  console.log('Firestore Connected:', firestoreConn.connected, 'Latency:', firestoreConn.latencyMs + 'ms');
  console.log('Sync Active Engine:', syncHealth.activeEngine);
  console.log('Sync Standby Engine:', syncHealth.standbyEngine);
  console.log('Sync Status isHealthy:', syncHealth.isHealthy);
  console.log('Sync Lag Seconds:', syncHealth.syncLagSeconds + 's');
  console.log('Pending Outbox Items:', syncHealth.pendingCount);
  console.log('Dead Letter Items:', syncHealth.deadLetterCount);
  console.log('Active Conflicts:', syncHealth.conflictCount);
  console.log('====================================');
  process.exit(0);
}
testLive().catch(err => {
  console.error('Live Test Error:', err);
  process.exit(1);
});
`;

fs.writeFileSync('scripts/remote_live_db_test.js', remoteCode);
execSync('scp -o BatchMode=yes scripts/remote_live_db_test.js airesume:~/backend/remote_live_db_test.js');
const output = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_live_db_test.js"').toString();
console.log(output);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_live_db_test.js"');
fs.unlinkSync('scripts/remote_live_db_test.js');
