import { execSync } from 'node:child_process';
import https from 'node:https';
import fs from 'node:fs';

const COMMIT_SHA = '2fbbeb5';
fs.writeFileSync('backend/COMMIT_SHA', COMMIT_SHA + '\n');

console.log('=== Step 1: Remote Pre-Deployment Backup ===');
execSync('ssh airesume "mkdir -p backups && tar -czf backups/pre-deploy-$(date +%s).tar.gz backend/index.js backend/routes backend/enterprise 2>/dev/null || true"', { stdio: 'inherit' });
console.log('Remote backup complete.');

console.log('\n=== Step 2: Deploying Backend Files ===');
execSync('tar -czf backend-bundle.tar.gz -C backend COMMIT_SHA index.js package.json routes services security enterprise sql', { stdio: 'inherit' });
execSync('ssh airesume "mkdir -p backend/enterprise backend/sql"', { stdio: 'inherit' });
execSync('scp backend-bundle.tar.gz airesume:backend-bundle.tar.gz', { stdio: 'inherit' });
execSync('ssh airesume "tar -xzf backend-bundle.tar.gz -C backend && rm backend-bundle.tar.gz"', { stdio: 'inherit' });
fs.unlinkSync('backend-bundle.tar.gz');
console.log('Backend files deployed.');

console.log('\n=== Step 3: Deploying Frontend Bundle ===');
execSync('tar -czf dist-bundle.tar.gz -C dist .', { stdio: 'inherit' });
execSync('scp dist-bundle.tar.gz airesume:dist-bundle.tar.gz', { stdio: 'inherit' });
execSync('ssh airesume "tar -xzf dist-bundle.tar.gz -C domains/airesume.projectdemo.guru/public_html && rm dist-bundle.tar.gz"', { stdio: 'inherit' });
fs.unlinkSync('dist-bundle.tar.gz');
console.log('Frontend bundle deployed.');

console.log('\n=== Step 4: Restarting Backend via PM2 ===');
execSync('ssh airesume "export PATH=/opt/alt/alt-nodejs20/root/usr/bin:/home/u727965524/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH; ~/.local/bin/pm2 restart airesume-backend --update-env"', { stdio: 'inherit' });
console.log('PM2 restarted.');

console.log('\n=== Step 5: Verifying Live Production Endpoints ===');
function fetchUrl(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'airesume.projectdemo.guru',
      port: 443,
      path: path,
      method: options.method || 'GET',
      headers: options.headers || { 'User-Agent': 'ResumePilotDeployVerifier/1.0' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function verifyLive() {
  const health = await fetchUrl('/api/health');
  console.log('[1] /api/health Status:', health.status, 'Body:', health.body);

  const entStatus = await fetchUrl('/api/enterprise/status');
  console.log('[2] /api/enterprise/status Status:', entStatus.status, 'Body:', entStatus.body);

  const root = await fetchUrl('/');
  console.log('[3] Root page Status:', root.status, 'HTML bytes:', root.body.length);
  console.log('Contains Enterprise in HTML/JS:', root.body.includes('Enterprise') || root.body.includes('HomepageNavbar'));

  const enterprisePage = await fetchUrl('/enterprise');
  console.log('[4] /enterprise page Status:', enterprisePage.status, 'HTML bytes:', enterprisePage.body.length);
}

verifyLive().catch(console.error);
