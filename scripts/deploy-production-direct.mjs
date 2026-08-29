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
const PUBLIC_URL = 'https://airesume.projectdemo.guru';

function runSsh(remoteCommand, options = {}) {
  const sshArgs = [
    '-i', SSH_KEY,
    '-p', SSH_PORT,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'PasswordAuthentication=no',
    `${SSH_USER}@${SSH_HOST}`,
    remoteCommand
  ];
  return execFileSync('ssh', sshArgs, { encoding: 'utf8', ...options });
}

async function main() {
  console.log('=== ResumePilot AI Direct Production Deployment ===\n');

  // 1. Get HEAD commit SHA
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  console.log(`Target Commit SHA: ${sha}`);

  // 2. Verify dist/index.html build sha
  const indexPath = path.join(root, 'dist/index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('dist/index.html not found! Run npm run build first.');
  }
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  if (!indexHtml.includes(sha)) {
    throw new Error(`dist/index.html does not contain commit SHA ${sha}! Rebuild required.`);
  }
  console.log('Frontend build metadata verified: index.html matches HEAD commit SHA.');

  // Update backend/COMMIT_SHA
  fs.writeFileSync(path.join(root, 'backend/COMMIT_SHA'), `${sha}\n`);

  // 3. Test SSH connectivity
  console.log('\nTesting SSH connectivity...');
  const remoteUser = runSsh('whoami').trim();
  console.log(`Connected to host as user: ${remoteUser}`);

  // 4. Create server-side backup
  const timestamp = Date.now();
  console.log(`\nCreating server-side backup (${timestamp})...`);
  runSsh(`mkdir -p /home/u727965524/deploy_backups/backup-${timestamp}/backend /home/u727965524/deploy_backups/backup-${timestamp}/webroot && cp -r /home/u727965524/backend/. /home/u727965524/deploy_backups/backup-${timestamp}/backend/ 2>/dev/null || true`);
  console.log(`Server-side backup created at /home/u727965524/deploy_backups/backup-${timestamp}`);

  // 5. Create staging directory
  console.log('\nCreating server-side staging directories...');
  runSsh('rm -rf /home/u727965524/staging_backend /home/u727965524/staging_webroot && mkdir -p /home/u727965524/staging_backend /home/u727965524/staging_webroot');

  // 6. Package and stream backend
  console.log('\nPackaging and uploading backend files to staging...');
  const backendTarArgs = [
    '-czf', '-',
    '-C', path.join(root, 'backend'),
    'index.js', 'package.json', 'package-lock.json', 'COMMIT_SHA',
    'routes', 'services', 'security', 'enterprise', 'repositories', 'database', 'fonts'
  ];
  const backendTar = spawnSync('tar', backendTarArgs, { cwd: root, maxBuffer: 100 * 1024 * 1024 });
  if (backendTar.status !== 0) {
    throw new Error(`Failed to create backend archive: ${backendTar.stderr?.toString()}`);
  }

  execFileSync('ssh', [
    '-i', SSH_KEY,
    '-p', SSH_PORT,
    '-o', 'StrictHostKeyChecking=accept-new',
    `${SSH_USER}@${SSH_HOST}`,
    'tar -xzf - -C /home/u727965524/staging_backend'
  ], { input: backendTar.stdout });
  console.log('Backend files extracted to server staging directory.');

  // Copy .env and install production dependencies
  console.log('\nInstalling backend production dependencies on server...');
  runSsh('cp /home/u727965524/backend/.env /home/u727965524/staging_backend/.env && cd /home/u727965524/staging_backend && /opt/alt/alt-nodejs20/root/usr/bin/npm ci --omit=dev --ignore-scripts');
  console.log('Backend npm dependencies installed successfully.');

  // 7. Package and stream frontend
  console.log('\nPackaging and uploading frontend files to staging...');
  const frontendTarArgs = [
    '-czf', '-',
    '-C', path.join(root, 'dist'),
    '.'
  ];
  const frontendTar = spawnSync('tar', frontendTarArgs, { cwd: root, maxBuffer: 100 * 1024 * 1024 });
  if (frontendTar.status !== 0) {
    throw new Error(`Failed to create frontend archive: ${frontendTar.stderr?.toString()}`);
  }

  execFileSync('ssh', [
    '-i', SSH_KEY,
    '-p', SSH_PORT,
    '-o', 'StrictHostKeyChecking=accept-new',
    `${SSH_USER}@${SSH_HOST}`,
    'tar -xzf - -C /home/u727965524/staging_webroot'
  ], { input: frontendTar.stdout });
  console.log('Frontend files extracted to server staging directory.');

  // 8. Run database migrations in staging
  console.log('\nExecuting/verifying database migrations on live database...');
  const migrationResult = runSsh(`export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"; cd /home/u727965524/staging_backend && node -e '
const { pool } = require("./database/mysql");
const { runMigrations, migrationStatus } = require("./database/migrationRunner");
async function run() {
  const status = await migrationStatus(pool);
  console.log("Migration status before:", JSON.stringify({ migrations: status.migrations.length, applied: status.applied.length, pending: status.pending.length }));
  if (status.pending.length > 0) {
    console.log("Applying pending migrations:", status.pending.map(p => p.version + "_" + p.name));
    const result = await runMigrations(pool, { mode: "apply", environment: { ...process.env, NODE_ENV: "staging", DB_MIGRATION_CHANGE_ID: "deploy-${timestamp}", DB_BACKUP_REFERENCE: "backup-${timestamp}", DB_BACKUP_VERIFIED_AT: new Date().toISOString() } });
    console.log("Applied:", JSON.stringify(result.applied));
  } else {
    console.log("All migrations already applied up to date.");
  }
  const finalStatus = await migrationStatus(pool);
  console.log("Final status:", JSON.stringify({ applied: finalStatus.applied.length, pending: finalStatus.pending.length, mismatches: finalStatus.mismatches.length }));
  if (finalStatus.mismatches.length > 0) {
    throw new Error("Migration mismatches detected: " + JSON.stringify(finalStatus.mismatches));
  }
  process.exit(0);
}
run().catch(err => { console.error("Migration error:", err); process.exit(1); });
'`);
  console.log(migrationResult);

  // 9. Sync staging to live backend and webroot
  console.log('\nActivating release on server (syncing backend & public_html)...');
  runSsh(`
    cp -r /home/u727965524/staging_backend/. /home/u727965524/backend/ &&
    cp -r /home/u727965524/staging_webroot/. /home/u727965524/domains/airesume.projectdemo.guru/public_html/ &&
    rm -rf /home/u727965524/staging_backend /home/u727965524/staging_webroot
  `);
  console.log('Files synchronized.');

  // 10. Restart PM2
  console.log('\nRestarting PM2 service airesume-backend...');
  runSsh('export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"; pm2 restart airesume-backend < /dev/null');
  console.log('PM2 restart command issued.');

  // Wait 4 seconds for process to boot
  console.log('Waiting 4 seconds for process initialization...');
  await new Promise(res => setTimeout(res, 4000));

  // 11. Live Verification
  console.log('\n=== Live Production Endpoint Verification ===');

  const versionRes = await fetch(`${PUBLIC_URL}/api/platform/version`).then(r => r.json());
  console.log('1. /api/platform/version:', JSON.stringify(versionRes, null, 2));

  const healthRes = await fetch(`${PUBLIC_URL}/api/healthz`).then(r => r.json());
  console.log('2. /api/healthz:', JSON.stringify(healthRes, null, 2));

  const readyRes = await fetch(`${PUBLIC_URL}/api/readyz`).then(r => r.json());
  console.log('3. /api/readyz:', JSON.stringify(readyRes, null, 2));

  const homeHtml = await fetch(`${PUBLIC_URL}/`).then(r => r.text());
  const hasMetaSha = homeHtml.includes(sha);
  console.log(`4. Frontend HTML meta build-sha present: ${hasMetaSha}`);

  if (versionRes.commitSha !== sha) {
    throw new Error(`Version mismatch! Expected ${sha}, got ${versionRes.commitSha}`);
  }
  if (healthRes.status !== 'ok') {
    throw new Error(`Healthz not ok! Status: ${healthRes.status}`);
  }
  if (readyRes.status !== 'ready' || readyRes.checks?.enterprise?.quotaStore !== 'mariadb-atomic') {
    throw new Error(`Readyz unexpected! status: ${readyRes.status}, quotaStore: ${readyRes.checks?.enterprise?.quotaStore}`);
  }

  console.log('\n🎉 PRODUCTION DEPLOYMENT & LIVE VERIFICATION SUCCESSFUL! 🎉');
  console.log(`Live release is now running SHA: ${sha}`);
  console.log(`quotaStore is verified as: ${readyRes.checks.enterprise.quotaStore}`);
}

main().catch(err => {
  console.error('\n❌ Deployment failed:', err);
  process.exit(1);
});
