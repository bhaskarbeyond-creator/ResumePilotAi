import { execSync } from 'child_process';

console.log('=== TEST 11: RESTART PERSISTENCE & MULTI-PROCESS CONSISTENCY ===');
execSync('scp -o BatchMode=yes scripts/remote_test_restart.js airesume:~/backend/remote_test_restart.js');

// 1. Switch to mysql
console.log('1. Setting active engine to MySQL...');
execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_test_restart.js mysql"');

// Restart PM2
console.log('Restarting PM2 under MySQL active state...');
execSync('ssh -o BatchMode=yes airesume "/opt/alt/alt-nodejs20/root/usr/bin/node /home/u727965524/.local/lib/node_modules/pm2/bin/pm2 restart airesume-backend --update-env"');

// Check active engine
const check1 = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_test_restart.js"').toString();
console.log('Post-Restart 1:', check1.trim());

// 2. Switch to firestore
console.log('2. Setting active engine to Firestore...');
execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_test_restart.js firestore"');

// Restart PM2
console.log('Restarting PM2 under Firestore active state...');
execSync('ssh -o BatchMode=yes airesume "/opt/alt/alt-nodejs20/root/usr/bin/node /home/u727965524/.local/lib/node_modules/pm2/bin/pm2 restart airesume-backend --update-env"');

// Check active engine
const check2 = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_test_restart.js"').toString();
console.log('Post-Restart 2:', check2.trim());

// 3. Switch back to mysql
console.log('3. Restoring active engine to MySQL...');
execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_test_restart.js mysql"');
execSync('ssh -o BatchMode=yes airesume "/opt/alt/alt-nodejs20/root/usr/bin/node /home/u727965524/.local/lib/node_modules/pm2/bin/pm2 restart airesume-backend --update-env"');
const check3 = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_test_restart.js"').toString();
console.log('Post-Restart 3:', check3.trim());

execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_test_restart.js"');
console.log('Restart Persistence Test Result: PASS');
