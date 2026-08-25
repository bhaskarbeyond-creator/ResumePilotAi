import { execSync } from 'child_process';
import fs from 'fs';

const remoteCode = `
const { getHealthSnapshot } = require('./backend/services/platformHealth');
const { getActiveEngine } = require('./backend/database/engineManager');
const { getPool } = require('./backend/database/mysql');

async function test() {
  console.log('=== PLATFORM COMMAND CENTER LIVE PROBE ===');
  console.log('Active Engine:', getActiveEngine());
  const pool = getPool();
  const [users] = await pool.query('SELECT count(*) as c FROM users');
  const [resumes] = await pool.query('SELECT count(*) as c FROM resumes');
  const [stats] = await pool.query('SELECT count(*) as c FROM stats');
  console.log('MySQL Users Count:', users[0].c);
  console.log('MySQL Resumes Count:', resumes[0].c);
  console.log('MySQL Stats Count:', stats[0].c);
  
  const snap = await getHealthSnapshot({ get: () => null });
  console.log('Overall Health State:', snap.summary.overall);
  const dbService = snap.services.find(s => s.id === 'database');
  console.log('Database Service Name:', dbService?.name);
  console.log('Database Service State:', dbService?.state);
  console.log('Database Reason:', dbService?.reason);
  console.log('Database Latency:', dbService?.metrics?.latencyMs + 'ms');
  console.log('==========================================');
  process.exit(0);
}

test().catch(err => {
  console.error('Error during health test:', err);
  process.exit(1);
});
`;

fs.writeFileSync('scripts/remote_probe.js', remoteCode);
execSync('scp -o BatchMode=yes scripts/remote_probe.js airesume:~/remote_probe.js');
const output = execSync('ssh -o BatchMode=yes airesume "/opt/alt/alt-nodejs20/root/usr/bin/node ~/remote_probe.js"').toString();
console.log(output);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/remote_probe.js"');
fs.unlinkSync('scripts/remote_probe.js');
