import { execSync } from 'child_process';
import fs from 'fs';

const code = `
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const { execSync } = require('child_process');
const { getPool } = require('./database/mysql');

async function reconcileWorkerPid() {
    console.log('=== WORKER PID RECONCILIATION ===');
    const pool = getPool();

    // 1. PM2 process list
    const pm2List = JSON.parse(execSync('/opt/alt/alt-nodejs20/root/usr/bin/node /home/u727965524/.local/lib/node_modules/pm2/bin/pm2 jlist', {
        env: { ...process.env, PATH: '/opt/alt/alt-nodejs20/root/usr/bin:' + process.env.PATH }
    }).toString());
    const backendProc = pm2List.find(p => p.name === 'airesume-backend');
    console.log('PM2 Backend App Name:', backendProc.name);
    console.log('PM2 Daemon PID:', backendProc.pid);
    console.log('PM2 Process Status:', backendProc.pm2_env.status);
    console.log('PM2 Process Uptime:', Math.floor(backendProc.pm2_env.pm_uptime / 1000));
    console.log('PM2 Restart Count:', backendProc.pm2_env.restart_time);

    // 2. MariaDB sync_worker_state table
    const [rows] = await pool.query("SELECT * FROM sync_worker_state WHERE worker_id = 'primary_sync_worker'");
    const state = rows[0];
    console.log('\\nMariaDB sync_worker_state Record:');
    console.log('  Worker ID:', state.worker_id);
    console.log('  Worker PID in DB:', state.worker_pid);
    console.log('  Worker Status:', state.worker_status);
    console.log('  Last Heartbeat At:', state.last_heartbeat_at);
    console.log('  Heartbeat Age:', ((Date.now() - new Date(state.last_heartbeat_at).getTime()) / 1000).toFixed(1) + 's ago');

    process.exit(0);
}

reconcileWorkerPid().catch(console.error);
`;

fs.writeFileSync('scripts/remote_reconcile_pid.js', code);
execSync('scp -o BatchMode=yes scripts/remote_reconcile_pid.js airesume:~/backend/remote_reconcile_pid.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_reconcile_pid.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_reconcile_pid.js"');
fs.unlinkSync('scripts/remote_reconcile_pid.js');
