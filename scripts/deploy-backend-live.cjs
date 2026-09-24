const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SSH_USER = 'u727965524';
const SSH_HOST = '82.112.232.112';
const SSH_PORT = '65002';
const SSH_KEY = path.join(root, 'dev_key');

function runSsh(remoteCommand) {
  const sshArgs = [
    '-i', SSH_KEY,
    '-p', SSH_PORT,
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'PasswordAuthentication=no',
    `${SSH_USER}@${SSH_HOST}`,
    remoteCommand
  ];
  return execFileSync('ssh', sshArgs, { encoding: 'utf8' });
}

async function main() {
  console.log('=== Deploying Updated Backend Files to IME365 Server ===\n');

  // 1. Get HEAD commit SHA
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  console.log(`Commit SHA: ${sha}`);
  fs.writeFileSync(path.join(root, 'backend/COMMIT_SHA'), `${sha}\n`);

  // 2. Package backend files
  console.log('Packaging backend subdirectories (services, routes, repositories, security, enterprise, database)...');
  const backendTarArgs = [
    '-czf', '-',
    '-C', path.join(root, 'backend'),
    'index.js', 'COMMIT_SHA',
    'routes', 'services', 'security', 'enterprise', 'repositories', 'database'
  ];
  const backendTar = spawnSync('tar', backendTarArgs, { cwd: root, maxBuffer: 100 * 1024 * 1024 });
  if (backendTar.status !== 0) {
    throw new Error(`Failed to create backend archive: ${backendTar.stderr?.toString()}`);
  }
  console.log(`Backend archive created (${backendTar.stdout.length} bytes).`);

  // 3. Stream to live server
  console.log('Streaming and extracting directly to /home/u727965524/backend ...');
  execFileSync('ssh', [
    '-i', SSH_KEY,
    '-p', SSH_PORT,
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'PasswordAuthentication=no',
    `${SSH_USER}@${SSH_HOST}`,
    'tar -xzf - -C /home/u727965524/backend'
  ], { input: backendTar.stdout });
  console.log('Extraction complete.');

  // 4. Reload PM2 process
  console.log('Reloading PM2 service airesume-backend...');
  const reloadOutput = runSsh('export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"; pm2 reload airesume-backend');
  console.log(reloadOutput);

  // 5. Verify line count on remote server
  console.log('Verifying remote aiRuntime.js and candidateContext.js line counts...');
  const verifyLines = runSsh('wc -l /home/u727965524/backend/services/aiRuntime.js /home/u727965524/backend/services/candidateContext.js');
  console.log(verifyLines);

  console.log('Backend deployment complete.');
}

main().catch(err => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
