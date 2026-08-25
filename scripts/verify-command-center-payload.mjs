import { execSync } from 'child_process';
import fs from 'fs';

const remoteCode = `
const express = require('express');
const { getActiveEngine } = require('./database/engineManager');
const { platformRouter } = require('./routes/platform');

const app = express();
app.set('db', null);
app.set('firebaseAdmin', { auth: () => ({ listUsers: () => Promise.resolve({ users: [] }) }) });

const req = { app, get: () => '', user: { uid: 'admin_super_001', claims: { role: 'SUPER_ADMIN' } } };
const res = {
  json: (data) => {
    console.log('=== LIVE COMMAND CENTER PAYLOAD OUTPUT ===');
    console.log('Health Score:', data.healthScore);
    console.log('System Status:', data.status);
    console.log('Database Provider:', data.subsystems.database.provider);
    console.log('Database Status:', data.subsystems.database.status);
    console.log('Database Latency:', data.subsystems.database.latencyMs + 'ms');
    console.log('KPI Total Users:', data.kpis.totalUsers);
    console.log('KPI Resumes Created:', data.kpis.resumesCreated);
    console.log('KPI Total Downloads:', data.kpis.totalDownloads);
    console.log('KPI Total Earnings:', data.kpis.totalEarnings + ' ' + data.kpis.currency);
    console.log('Operational Status Overall:', data.operationalStatus?.overall);
    console.log('Recommendations Count:', data.recommendations?.length);
    console.log('==========================================');
    process.exit(0);
  },
  status: (code) => {
    console.error('HTTP Status Error:', code);
    return res;
  }
};

const routeHandler = platformRouter.stack.find(s => s.route && s.route.path === '/command-center').route.stack[0].handle;
routeHandler(req, res).catch(err => {
  console.error('Command Center Route Error:', err);
  process.exit(1);
});
`;

fs.writeFileSync('scripts/remote_cc_test.js', remoteCode);
execSync('scp -o BatchMode=yes scripts/remote_cc_test.js airesume:~/backend/remote_cc_test.js');
const output = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_cc_test.js"').toString();
console.log(output);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_cc_test.js"');
fs.unlinkSync('scripts/remote_cc_test.js');
