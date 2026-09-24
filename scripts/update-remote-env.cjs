const { execFileSync } = require('child_process');
const path = require('path');
const SSH_KEY = path.join(__dirname, '..', 'dev_key');

function runSsh(cmd) {
  return execFileSync('ssh', [
    '-i', SSH_KEY,
    '-p', '65002',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'PasswordAuthentication=no',
    'u727965524@82.112.232.112',
    cmd
  ], { encoding: 'utf8' });
}

console.log('Ensuring PUBLIC_APP_URL and TARGET_URL in backend/.env...');
runSsh(`
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
grep -q "PUBLIC_APP_URL" /home/u727965524/backend/.env || echo 'PUBLIC_APP_URL="https://ime365.com"' >> /home/u727965524/backend/.env
grep -q "TARGET_URL" /home/u727965524/backend/.env || echo 'TARGET_URL="https://ime365.com"' >> /home/u727965524/backend/.env
pm2 reload airesume-backend
`);

const check = runSsh('grep -E "PUBLIC_APP_URL|TARGET_URL|WEBSITE_NAME" /home/u727965524/backend/.env');
console.log('Verified .env keys:');
console.log(check);
