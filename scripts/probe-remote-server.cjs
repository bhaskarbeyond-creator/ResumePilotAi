const { execFileSync } = require('child_process');
const path = require('path');

const SSH_KEY = path.join(__dirname, '..', 'dev_key');

function ssh(cmd) {
  return execFileSync('ssh', [
    '-i', SSH_KEY,
    '-p', '65002',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'PasswordAuthentication=no',
    'u727965524@82.112.232.112',
    cmd
  ], { encoding: 'utf8' });
}

console.log('--- Checking Node processes ---');
try {
  console.log(ssh('ps aux | grep node | grep -v grep'));
} catch (e) {
  console.log('No node processes found or grep returned 1');
}

console.log('--- Checking airesume.projectdemo.guru .htaccess ---');
try {
  console.log(ssh('cat /home/u727965524/domains/airesume.projectdemo.guru/public_html/.htaccess'));
} catch (e) {
  console.log('Could not read .htaccess');
}

console.log('--- Checking pm2 / supervisor / crontab ---');
try {
  console.log(ssh('crontab -l || true'));
} catch (e) {}

try {
  console.log(ssh('pm2 list || true'));
} catch (e) {}
