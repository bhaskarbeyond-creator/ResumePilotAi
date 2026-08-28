import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const activeDeliveryFiles = [
  '.github/workflows/production-release.yml',
  'scripts/create-production-release.sh',
  'scripts/production-release-client.sh',
  'scripts/sign-production-release.mjs',
  'ops/deploy/forced-command-gateway.sh',
  'ops/deploy/install-production-gateway.sh',
  'ops/deploy/remote-deploy.sh',
];

test('active production delivery forbids trust-on-first-use, passwords, and sshpass', () => {
  const combined = activeDeliveryFiles.map(read).join('\n');
  assert.doesNotMatch(combined, /StrictHostKeyChecking\s*=\s*(?:no|accept-new)/i);
  assert.doesNotMatch(combined, /AutoAddPolicy|sshpass|PROD_SSH_PASS|PasswordAuthentication=yes/i);
  assert.match(combined, /StrictHostKeyChecking=yes/);
  assert.match(combined, /PasswordAuthentication=no/);
  assert.match(combined, /UserKnownHostsFile/);
});

test('tracked operational code contains no insecure SSH trust bypass', () => {
  const tracked = execFileSync('git', [
    'ls-files', '-z', '--', '*.sh', '*.py', '*.js', '*.cjs', '*.mjs', '*.yml', '*.yaml', '*.ps1',
  ], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((relative) => fs.existsSync(path.join(root, relative)));
  const ownTest = 'tests/production-delivery-security.test.mjs';
  const insecure = /StrictHostKeyChecking\s*=\s*(?:no|accept-new)|AutoAddPolicy|WarningPolicy|sshpass|UserKnownHostsFile\s*=\s*\/dev\/null|PasswordAuthentication\s*=\s*yes/i;
  const violations = tracked
    .filter((relative) => relative !== ownTest)
    .filter((relative) => insecure.test(read(relative)));
  assert.deepEqual(violations, [], `insecure SSH behavior in: ${violations.join(', ')}`);
});

test('production workflow is manual, serialized, least-privilege, and environment-gated', () => {
  const workflow = read('.github/workflows/production-release.yml');
  assert.match(workflow, /^\s{2}workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request|schedule):/m);
  assert.match(workflow, /^permissions:\n\s{2}contents: read$/m);
  assert.match(workflow, /group: resumepilot-production/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /name: production/);
  assert.match(workflow, /environment:/);
  assert.match(workflow, /REQUESTED_SHA.*\^\[0-9a-f\]\{40\}\$/s);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /deploy:DEPLOY/);
  assert.match(workflow, /rollback:ROLLBACK/);
  assert.match(workflow, /persist-credentials: false/g);
  assert.match(workflow, /path: delivery-tooling/);
  assert.match(workflow, /path: source/);

  const actionUses = [...workflow.matchAll(/^\s+uses:\s+([^\s#]+)/gm)].map((match) => match[1]);
  assert.ok(actionUses.length >= 4);
  for (const use of actionUses) {
    assert.match(use, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/, `action must be SHA-pinned: ${use}`);
  }
});

test('active CI gates provision a digest-pinned isolated database before backend tests', () => {
  const workflows = [
    read('.github/workflows/quality-gate.yml'),
    read('.github/workflows/production-release.yml'),
  ];
  const launcher = read('scripts/start-ci-mariadb.sh');
  const expectedImage = 'mariadb@sha256:4f1d8d202fcf7bcb3902f63af09f9c1a050c2922a89652f22abaec0d4f015e83';
  for (const workflow of workflows) {
    assert.match(workflow, new RegExp(expectedImage));
    assert.match(workflow, /scripts\/start-ci-mariadb\.sh/);
    assert.match(workflow, /initializeSchema\(\)/);
    assert.match(workflow, /npm --prefix backend test|npm run test:security/);
  }
  assert.match(launcher, new RegExp(expectedImage));
  assert.match(launcher, /MARIADB_CI_DATABASE:-resumepilot_ci/);
  assert.match(launcher, /export MARIADB_DATABASE="\$DATABASE"/);
  assert.match(launcher, /--env MARIADB_DATABASE/);
  assert.match(launcher, /healthcheck\.sh --connect --innodb_initialized/);
  assert.match(launcher, /MARIADB_CI_DATABASE must be explicitly disposable/);
});

test('forced-command key cannot invoke an arbitrary remote shell', () => {
  const gateway = read('ops/deploy/forced-command-gateway.sh');
  const installer = read('ops/deploy/install-production-gateway.sh');
  assert.match(gateway, /SSH_ORIGINAL_COMMAND/);
  assert.match(gateway, /\^release\\ \(\[0-9a-f\]\{40\}\)\\ \(\[0-9a-f\]\{64\}\)\\ \(\[A-Za-z0-9_-\]\{86\}\)\$/);
  assert.match(gateway, /env -i/);
  assert.doesNotMatch(gateway, /eval|bash\s+-c|sh\s+-c/);
  assert.match(installer, /restrict,command=/);
  assert.match(installer, /AUTHORIZED_KEYS\.backup/);
  assert.doesNotMatch(installer, /no-port-forwarding.*no-pty.*ssh-/s, 'use OpenSSH restrict rather than an incomplete hand-written option set');
});

test('server receiver validates archives, hashes, lock, staging, health, and rollback', () => {
  const receiver = read('ops/deploy/remote-deploy.sh');
  for (const invariant of [
    'MAX_BUNDLE_BYTES',
    'deploy.lock',
    'unsafe archive path',
    'links and special files are forbidden',
    'sha256sum',
    'release signature verification failed',
    'RELEASE_SIGNING_PUBLIC_KEY',
    'realpath -e',
    'frontend build identity does not match',
    'ci --omit=dev --ignore-scripts',
    'sync_frontend',
    '/api/healthz',
    '/api/readyz',
    'rollback_switch',
    'release interrupted during activation',
  ]) {
    assert.ok(receiver.includes(invariant), `missing receiver invariant: ${invariant}`);
  }
  assert.doesNotMatch(receiver, /source\s+\$|eval/);
});

test('all production shell scripts pass bash syntax validation', () => {
  execFileSync(process.execPath, ['--check', path.join(root, 'scripts/sign-production-release.mjs')], { stdio: 'pipe' });
  for (const relative of [
    'scripts/create-production-release.sh',
    'scripts/production-release-client.sh',
    'scripts/hostinger-release.sh',
    'ops/deploy/forced-command-gateway.sh',
    'ops/deploy/install-production-gateway.sh',
    'ops/deploy/remote-deploy.sh',
  ]) {
    execFileSync('bash', ['-n', path.join(root, relative)], { stdio: 'pipe' });
  }
});

test('release builder emits only the fixed outer payload and allow-listed backend', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'resumepilot-release-test-'));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resumepilot-release-output-'));
  try {
    const files = {
      '.gitignore': 'dist/\n',
      'dist/index.html': '<!doctype html><script src="/assets/index-safe.js"></script>',
      'dist/.htaccess': 'RewriteEngine On\n',
      'dist/api/index.php': '<?php http_response_code(200);',
      'dist/assets/index-safe.js': 'console.log("safe")',
      'backend/index.js': 'throw new Error("Invalid key: expected -----BEGIN PRIVATE KEY-----")',
      'backend/package.json': '{"name":"fixture","version":"1.0.0"}',
      'backend/package-lock.json': '{"name":"fixture","version":"1.0.0","lockfileVersion":3,"packages":{}}',
      'backend/routes/index.js': 'module.exports = {}',
      'backend/services/index.js': 'module.exports = {}',
      'backend/security/index.js': 'module.exports = {}',
      'backend/enterprise/index.js': 'module.exports = {}',
      'backend/database/schema.sql': 'SELECT 1;',
      'backend/repositories/index.js': 'module.exports = {}',
      'backend/fonts/fixture.ttf': 'font',
      'backend/.env': 'MUST_NOT_SHIP=true',
      'backend/test/not-runtime.test.js': 'throw new Error("must not ship")',
    };
    for (const [relative, content] of Object.entries(files)) {
      const target = path.join(fixture, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    execFileSync('git', ['init', '-q'], { cwd: fixture });
    execFileSync('git', ['config', 'user.email', 'delivery-test@example.invalid'], { cwd: fixture });
    execFileSync('git', ['config', 'user.name', 'Delivery Test'], { cwd: fixture });
    execFileSync('git', ['add', '.'], { cwd: fixture });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: fixture });
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fixture, encoding: 'utf8' }).trim();
    const staleBuild = spawnSync(
      path.join(root, 'scripts/create-production-release.sh'),
      [sha, path.join(outputDir, 'stale.tar.gz')],
      { cwd: root, env: { ...process.env, RELEASE_SOURCE_ROOT: fixture }, encoding: 'utf8' },
    );
    assert.notEqual(staleBuild.status, 0);
    assert.match(staleBuild.stderr, /dist\/index\.html was not built from release commit/);

    fs.writeFileSync(
      path.join(fixture, 'dist/index.html'),
      `<!doctype html><meta data-build-sha="${sha}" content="${sha}"><script src="/assets/index-safe.js"></script>`,
    );
    const output = path.join(outputDir, 'release.tar.gz');

    execFileSync(path.join(root, 'scripts/create-production-release.sh'), [sha, output], {
      cwd: root,
      env: { ...process.env, RELEASE_SOURCE_ROOT: fixture },
      stdio: 'pipe',
    });

    const outer = execFileSync('tar', ['-tzf', output], { encoding: 'utf8' }).trim().split('\n').sort();
    assert.deepEqual(outer, ['SHA256SUMS', 'backend.tar.gz', 'frontend.tar.gz', 'manifest.env'].sort());

    const extracted = path.join(outputDir, 'outer');
    fs.mkdirSync(extracted);
    execFileSync('tar', ['-xzf', output, '-C', extracted]);
    const backendMembers = execFileSync('tar', ['-tzf', path.join(extracted, 'backend.tar.gz')], { encoding: 'utf8' });
    assert.match(backendMembers, /\.\/COMMIT_SHA/);
    assert.match(backendMembers, /\.\/fonts\/fixture\.ttf/);
    assert.doesNotMatch(backendMembers, /\.env|backend\/test|not-runtime/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test('release builder fails closed when public build contains a credential-shaped file', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'resumepilot-release-reject-'));
  try {
    fs.writeFileSync(path.join(fixture, '.gitignore'), 'dist/\n');
    const required = [
      'dist/index.html', 'dist/.htaccess', 'dist/api/index.php',
      'backend/index.js', 'backend/package.json', 'backend/package-lock.json',
      'backend/routes/x', 'backend/services/x', 'backend/security/x',
      'backend/enterprise/x', 'backend/database/x', 'backend/repositories/x', 'backend/fonts/x',
    ];
    for (const relative of required) {
      const target = path.join(fixture, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, relative.endsWith('.json') ? '{}' : 'safe');
    }
    fs.writeFileSync(path.join(fixture, 'dist/id_ed25519'), 'not-even-a-real-key');
    execFileSync('git', ['init', '-q'], { cwd: fixture });
    execFileSync('git', ['config', 'user.email', 'delivery-test@example.invalid'], { cwd: fixture });
    execFileSync('git', ['config', 'user.name', 'Delivery Test'], { cwd: fixture });
    execFileSync('git', ['add', '.'], { cwd: fixture });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: fixture });
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fixture, encoding: 'utf8' }).trim();
    fs.writeFileSync(path.join(fixture, 'dist/index.html'), `<meta data-build-sha="${sha}" content="${sha}">`);
    const result = spawnSync(path.join(root, 'scripts/create-production-release.sh'), [sha, path.join(fixture, 'release.tar.gz')], {
      cwd: root,
      env: { ...process.env, RELEASE_SOURCE_ROOT: fixture },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /credential-shaped file entered the public frontend build/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('release builder rejects private-key material inside an allow-listed backend file', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'resumepilot-release-key-reject-'));
  try {
    fs.writeFileSync(path.join(fixture, '.gitignore'), 'dist/\n');
    const required = [
      'dist/index.html', 'dist/.htaccess', 'dist/api/index.php',
      'backend/index.js', 'backend/package.json', 'backend/package-lock.json',
      'backend/routes/x', 'backend/services/x', 'backend/security/x',
      'backend/enterprise/x', 'backend/database/x', 'backend/repositories/x', 'backend/fonts/x',
    ];
    for (const relative of required) {
      const target = path.join(fixture, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, relative.endsWith('.json') ? '{}' : 'safe');
    }
    const begin = `-----${'BEGIN'} PRIVATE KEY-----`;
    const end = `-----${'END'} PRIVATE KEY-----`;
    fs.writeFileSync(path.join(fixture, 'backend/services/x'), `${begin}\n${'A'.repeat(160)}\n${end}\n`);
    execFileSync('git', ['init', '-q'], { cwd: fixture });
    execFileSync('git', ['config', 'user.email', 'delivery-test@example.invalid'], { cwd: fixture });
    execFileSync('git', ['config', 'user.name', 'Delivery Test'], { cwd: fixture });
    execFileSync('git', ['add', '.'], { cwd: fixture });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: fixture });
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fixture, encoding: 'utf8' }).trim();
    fs.writeFileSync(path.join(fixture, 'dist/index.html'), `<meta data-build-sha="${sha}" content="${sha}">`);
    const result = spawnSync(path.join(root, 'scripts/create-production-release.sh'), [sha, path.join(fixture, 'release.tar.gz')], {
      cwd: root,
      env: { ...process.env, RELEASE_SOURCE_ROOT: fixture },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /private-key material detected/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('legacy direct deploy entrypoints are fail-closed or delegate to the restricted client', () => {
  assert.match(read('scripts/deploy-live.mjs'), /is retired/);
  assert.match(read('scripts/deploy_production.py'), /is retired/);
  const compatibility = read('scripts/hostinger-release.sh');
  assert.match(compatibility, /production-release-client\.sh/);
  assert.doesNotMatch(compatibility, /scp|sshpass|accept-new/);
});

test('gitignore covers extensionless SSH identities and local release bundles', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /^\*\*\/id_ed25519\*$/m);
  assert.match(ignore, /^\*\*\/id_rsa\*$/m);
  assert.match(ignore, /^\/\.release\/$/m);
});
