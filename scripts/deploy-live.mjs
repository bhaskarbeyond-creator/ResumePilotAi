import { execSync } from 'node:child_process';
import https from 'node:https';
import fs from 'node:fs';

// Derive the deploy SHA from the checked-out commit so backend/COMMIT_SHA is
// never stale. Never hardcode a SHA here.
const COMMIT_SHA = execSync('git rev-parse HEAD').toString().trim();
if (!/^[0-9a-f]{40}$/.test(COMMIT_SHA)) {
  console.error('Could not resolve the current git commit SHA; refusing to deploy.');
  process.exit(1);
}
fs.writeFileSync('backend/COMMIT_SHA', COMMIT_SHA + '\n');

// Fail before touching production if the frontend build is missing or
// incomplete — a deploy without dist/index.html leaves every SPA route
// returning HTTP 500.
if (!fs.existsSync('dist/index.html')) {
  console.error('dist/index.html is missing. Run `npm run build` before deploying.');
  process.exit(1);
}

console.log('=== Step 1: Remote Pre-Deployment Backup ===');
execSync("ssh -o BatchMode=yes airesume 'set -e; mkdir -p backups; archive=backups/pre-deploy-$(date +%s).tar.gz; tar -czf \"$archive\" backend/index.js backend/routes backend/services backend/security backend/enterprise domains/airesume.projectdemo.guru/public_html; test -s \"$archive\"; tar -tzf \"$archive\" >/dev/null; printf \"Verified backup: %s\\n\" \"$archive\"'", { stdio: 'inherit' });
console.log('Remote backup created and readability verified.');

console.log('\n=== Step 2: Deploying Backend Files ===');
execSync('tar -czf backend-bundle.tar.gz -C backend COMMIT_SHA index.js package.json routes services security enterprise', { stdio: 'inherit' });
execSync('ssh -o BatchMode=yes airesume "mkdir -p backend/enterprise"', { stdio: 'inherit' });
execSync('scp -o BatchMode=yes backend-bundle.tar.gz airesume:backend-bundle.tar.gz', { stdio: 'inherit' });
execSync('ssh -o BatchMode=yes airesume "tar -xzf backend-bundle.tar.gz -C backend && rm backend-bundle.tar.gz"', { stdio: 'inherit' });
if (fs.existsSync('backend-bundle.tar.gz')) fs.unlinkSync('backend-bundle.tar.gz');
console.log('Backend files deployed.');

console.log('\n=== Step 3: Deploying Frontend Bundle ===');
execSync('tar -czf dist-bundle.tar.gz -C dist .', { stdio: 'inherit' });
execSync('scp -o BatchMode=yes dist-bundle.tar.gz airesume:dist-bundle.tar.gz', { stdio: 'inherit' });
execSync('ssh -o BatchMode=yes airesume "tar -xzf dist-bundle.tar.gz -C domains/airesume.projectdemo.guru/public_html && rm dist-bundle.tar.gz && test -s domains/airesume.projectdemo.guru/public_html/index.html && test -d domains/airesume.projectdemo.guru/public_html/assets && test -f domains/airesume.projectdemo.guru/public_html/.htaccess"', { stdio: 'inherit' });
if (fs.existsSync('dist-bundle.tar.gz')) fs.unlinkSync('dist-bundle.tar.gz');
console.log('Frontend bundle deployed and static entry/assets/rewrite file verified on remote host.');

console.log('\n=== Step 4: Restarting Backend via PM2 ===');
execSync('ssh -o BatchMode=yes airesume "export PATH=/opt/alt/alt-nodejs20/root/usr/bin:/home/u727965524/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH; ~/.local/bin/pm2 restart resumepilot-backend --update-env || ~/.local/bin/pm2 restart airesume-backend --update-env"', { stdio: 'inherit' });
console.log('PM2 restarted (canonical resumepilot-backend name, legacy fallback only if required).');

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
  console.log('Waiting 2.5s for Node.js backend to finish startup...');
  await new Promise(r => setTimeout(r, 2500));

  const health = await fetchUrl('/api/health');
  console.log('[1] /api/health Status:', health.status, 'Body:', health.body);

  const entStatus = await fetchUrl('/api/enterprise/status');
  console.log('[2] /api/enterprise/status Status:', entStatus.status, 'Body:', entStatus.body);

  const root = await fetchUrl('/');
  console.log('[3] Root page Status:', root.status, 'HTML bytes:', root.body.length);
  console.log('Contains Enterprise in HTML/JS:', root.body.includes('Enterprise') || root.body.includes('HomepageNavbar'));

  const enterprisePage = await fetchUrl('/enterprise');
  console.log('[4] /enterprise page Status:', enterprisePage.status, 'HTML bytes:', enterprisePage.body.length);

  // /adm is a first-class release gate: a healthy API with a missing SPA entry
  // point is a production outage for Super Admins.
  const adminPage = await fetchUrl('/adm');
  const indexPage = await fetchUrl('/index.html');
  const looksLikeSpa = response => response.status === 200 && /<div id="root"|<div id='root'/.test(response.body);
  console.log('[5] /adm page Status:', adminPage.status, 'SPA:', looksLikeSpa(adminPage));
  console.log('[6] /index.html Status:', indexPage.status, 'SPA:', looksLikeSpa(indexPage));

  if (health.status !== 200 || !looksLikeSpa(root) || !looksLikeSpa(enterprisePage) || !looksLikeSpa(adminPage) || !looksLikeSpa(indexPage)) {
    console.error('DEPLOYMENT VERIFICATION FAILED: expected healthy API and SPA HTTP 200 for /, /enterprise, /adm, and /index.html.');
    process.exitCode = 1;
  }
}

verifyLive().catch(error => { console.error(error); process.exitCode = 1; });
