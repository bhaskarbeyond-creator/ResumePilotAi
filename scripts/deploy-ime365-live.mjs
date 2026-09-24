import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const SSH_USER = 'u727965524';
const SSH_HOST = '82.112.232.112';
const SSH_PORT = '65002';
const SSH_KEY = path.join(root, 'dev_key');

function runSsh(remoteCommand, options = {}) {
  const sshArgs = [
    '-i', SSH_KEY,
    '-p', SSH_PORT,
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'PasswordAuthentication=no',
    `${SSH_USER}@${SSH_HOST}`,
    remoteCommand
  ];
  return execFileSync('ssh', sshArgs, { encoding: 'utf8', ...options });
}

async function main() {
  console.log('=== Deploying IME365.com Live Production ===\n');

  // 1. Get HEAD commit SHA
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  console.log(`Target Commit SHA: ${sha}`);

  // 2. Verify dist/index.html
  const indexPath = path.join(root, 'dist/index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('dist/index.html not found! Run npm run build first.');
  }
  fs.writeFileSync(path.join(root, 'backend/COMMIT_SHA'), `${sha}\n`);

  // 3. Test SSH connectivity
  console.log('\nTesting SSH connectivity...');
  const remoteUser = runSsh('whoami').trim();
  console.log(`Connected to host as user: ${remoteUser}`);

  // 4. Create staging directory on server
  console.log('\nCreating server-side staging directories...');
  runSsh('rm -rf /home/u727965524/staging_ime365_webroot && mkdir -p /home/u727965524/staging_ime365_webroot');

  // 5. Package and upload frontend to staging
  console.log('\nPackaging and uploading frontend to staging...');
  const tarFile = path.join(root, 'dist.tar.gz');
  const frontendTar = spawnSync('tar', ['-czf', tarFile, '-C', path.join(root, 'dist'), '.'], { cwd: root });
  if (frontendTar.status !== 0) {
    throw new Error(`Failed to create frontend archive: ${frontendTar.stderr?.toString()}`);
  }

  try {
    execFileSync('scp', [
      '-i', SSH_KEY,
      '-P', SSH_PORT,
      '-o', 'StrictHostKeyChecking=yes',
      '-o', 'PasswordAuthentication=no',
      tarFile,
      `${SSH_USER}@${SSH_HOST}:/home/u727965524/dist.tar.gz`
    ]);
    runSsh('tar -xzf /home/u727965524/dist.tar.gz -C /home/u727965524/staging_ime365_webroot && rm -f /home/u727965524/dist.tar.gz');
    console.log('Frontend extracted to staging_ime365_webroot.');
  } finally {
    if (fs.existsSync(tarFile)) {
      try { fs.unlinkSync(tarFile); } catch {}
    }
  }

  // 6. Ensure .htaccess and api/index.php are prepared
  console.log('\nDeploying .htaccess and api proxy to ime365.com public_html...');
  runSsh(`
    mkdir -p /home/u727965524/domains/ime365.com/public_html/api &&
    cp -r /home/u727965524/staging_ime365_webroot/. /home/u727965524/domains/ime365.com/public_html/ &&
    cp -r /home/u727965524/staging_ime365_webroot/. /home/u727965524/domains/airesume.projectdemo.guru/public_html/ &&
    cp -r /home/u727965524/staging_ime365_webroot/. /home/u727965524/backend/dist/ &&
    cp /home/u727965524/domains/airesume.projectdemo.guru/public_html/.htaccess /home/u727965524/domains/ime365.com/public_html/.htaccess &&
    cp /home/u727965524/domains/airesume.projectdemo.guru/public_html/api/index.php /home/u727965524/domains/ime365.com/public_html/api/index.php &&
    rm -rf /home/u727965524/staging_ime365_webroot
  `);
  console.log('ime365.com webroot synchronized with latest build, .htaccess, and api/index.php proxy.');

  // 7. Update backend .env for ime365.com
  console.log('\nConfiguring backend .env for ime365.com...');
  runSsh(`
    sed -i 's/^WEBSITE_NAME=.*/WEBSITE_NAME="ime365.com"/' /home/u727965524/backend/.env
    sed -i 's/^TARGET_URL=.*/TARGET_URL="https:\\/\\/ime365.com"/' /home/u727965524/backend/.env
    sed -i 's/^ADMIN_EMAIL=.*/ADMIN_EMAIL="bhaskar.beyond@gmail.com"/' /home/u727965524/backend/.env
  `);

  // 8. Restart PM2 backend process
  console.log('\nRestarting PM2 backend service airesume-backend...');
  runSsh('export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"; pm2 restart airesume-backend < /dev/null');
  console.log('PM2 restart signal sent.');

  console.log('Waiting 5 seconds for backend to boot...');
  await new Promise(res => setTimeout(res, 5000));

  // 9. Purge Cloudflare Edge Cache for ime365.com
  console.log('\nPurging Cloudflare edge cache for ime365.com...');
  const cfToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_TOKEN || '';
  const zoneId = 'd8ccfbd6071f6832c01ead8cef2bed3f';
  try {
    const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ purge_everything: true })
    });
    const cfData = await cfRes.json();
    console.log('Cloudflare cache purge result:', cfData.success ? 'SUCCESS' : cfData.errors);
  } catch (err) {
    console.warn('Cloudflare cache purge notice:', err.message);
  }

  console.log('\n🎉 ime365.com Deployment Completed Successfully! 🎉');
}

main().catch(err => {
  console.error('\n❌ Deployment failed:', err);
  process.exit(1);
});
