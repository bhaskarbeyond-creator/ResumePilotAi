import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseBuilder = path.join(root, 'scripts/create-production-release.sh');
const releaseSigner = path.join(root, 'scripts/sign-production-release.mjs');
const receiver = path.join(root, 'ops/deploy/remote-deploy.sh');
const gatewayInstaller = path.join(root, 'ops/deploy/install-production-gateway.sh');

const bashBin = process.platform === 'win32' && fs.existsSync('C:\\Program Files\\Git\\bin\\bash.exe')
  ? 'C:\\Program Files\\Git\\bin\\bash.exe'
  : 'bash';

const hasPython3 = (() => {
  try {
    const res = spawnSync(bashBin, ['-c', 'python3 -c "import sys; print(1)"'], { encoding: 'utf8' });
    return res.status === 0 && res.stdout.trim() === '1';
  } catch (_) {
    return false;
  }
})();

function write(target, content, mode) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  if (mode) fs.chmodSync(target, mode);
}

function commitFixture(source, marker) {
  if (!fs.existsSync(path.join(source, '.gitignore'))) write(path.join(source, '.gitignore'), 'dist/\n');
  write(path.join(source, 'backend/index.js'), `console.log(${JSON.stringify(marker)});`);
  write(path.join(source, 'backend/package.json'), '{"name":"fixture","version":"1.0.0"}');
  write(path.join(source, 'backend/package-lock.json'), '{"name":"fixture","version":"1.0.0","lockfileVersion":3,"packages":{}}');
  for (const relative of [
    'routes/index.js', 'services/index.js', 'security/index.js', 'enterprise/index.js',
    'repositories/index.js', 'database/schema.sql', 'fonts/fixture.ttf',
  ]) {
    write(path.join(source, 'backend', relative), `fixture-${marker}`);
  }
  execFileSync('git', ['add', '.'], { cwd: source });
  execFileSync('git', ['commit', '-qm', marker], { cwd: source });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
  write(path.join(source, 'dist/index.html'), `<!doctype html><head><meta name="build-sha" data-build-sha="${sha}" content="${sha}" /></head><body>${marker}<script src="/assets/index-${marker}.js"></script></body>`);
  write(path.join(source, `dist/assets/index-${marker}.js`), `console.log(${JSON.stringify(marker)})`);
  write(path.join(source, 'dist/.htaccess'), 'RewriteEngine On\n');
  write(path.join(source, 'dist/api/index.php'), '<?php http_response_code(200);');
  return sha;
}

function buildBundle(source, sha, destination) {
  const runner = process.platform === 'win32' || releaseBuilder.endsWith('.sh') ? bashBin : releaseBuilder;
  const args = runner === bashBin ? [releaseBuilder, sha, destination] : [sha, destination];
  execFileSync(runner, args, {
    cwd: root,
    env: { ...process.env, RELEASE_SOURCE_ROOT: source },
    stdio: 'pipe',
  });
}

function signBundle(bundle, sha, privateKeyFile) {
  const output = execFileSync(process.execPath, [releaseSigner, bundle, sha, privateKeyFile], { encoding: 'utf8' });
  return Object.fromEntries(output.trim().split('\n').map((line) => line.split('=', 2)));
}

test('gateway installer creates an idempotent forced-command key and denies arbitrary SSH commands', { timeout: 15_000 }, (t) => {
  if (!hasPython3) {
    t.skip('python3 is required for gateway installer test');
    return;
  }
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'resumepilot-installer-test-'));
  try {
    const home = path.join(sandbox, 'home');
    const localBin = path.join(home, '.local/bin');
    const backend = path.join(home, 'backend');
    const webroot = path.join(home, 'domains/example.test/public_html');
    const deployKey = path.join(sandbox, 'deploy-key');
    fs.mkdirSync(localBin, { recursive: true });
    write(path.join(backend, 'COMMIT_SHA'), `${'0'.repeat(40)}\n`);
    write(path.join(webroot, 'index.html'), '<!doctype html>');
    write(path.join(localBin, 'npm'), '#!/usr/bin/env bash\nexit 0\n', 0o700);
    write(path.join(localBin, 'pm2'), `#!/usr/bin/env bash
[[ "\${1:-}" == "pid" ]] && { printf '12345\\n'; exit 0; }
exit 0
`, 0o700);

    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', deployKey]);
    const signingKeys = generateKeyPairSync('ed25519');
    const signingPublicPem = signingKeys.publicKey.export({ type: 'spki', format: 'pem' });
    const signingPrivatePem = signingKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
    const installEnv = {
      ...process.env,
      HOME: home,
      NODE_BIN: process.execPath,
      NPM_BIN: path.join(localBin, 'npm'),
      PM2_BIN: path.join(localBin, 'pm2'),
      PROD_DOMAIN: 'example.test',
      DEPLOY_PUBLIC_KEY_B64: Buffer.from(fs.readFileSync(`${deployKey}.pub`)).toString('base64'),
      DEPLOY_SIGNING_PUBLIC_KEY_B64: Buffer.from(signingPublicPem).toString('base64'),
    };

    const privateKeyAsPublic = spawnSync(bashBin, [gatewayInstaller], {
      env: {
        ...installEnv,
        DEPLOY_SIGNING_PUBLIC_KEY_B64: Buffer.from(signingPrivatePem).toString('base64'),
      },
      encoding: 'utf8',
    });
    assert.notEqual(privateKeyAsPublic.status, 0, 'the server must never accept signing private material');
    assert.match(`${privateKeyAsPublic.stdout}\n${privateKeyAsPublic.stderr}`, /PUBLIC KEY PEM block/);

    execFileSync(bashBin, [gatewayInstaller], { env: installEnv, stdio: 'pipe' });
    execFileSync(bashBin, [gatewayInstaller], { env: installEnv, stdio: 'pipe' });

    const authorizedKeys = fs.readFileSync(path.join(home, '.ssh/authorized_keys'), 'utf8');
    const managedLines = authorizedKeys.split('\n').filter((line) => line.includes('resumepilot-github-actions'));
    assert.equal(managedLines.length, 1, 'reinstall must replace, not duplicate, the managed key');
    assert.match(managedLines[0], /^restrict,command="[^"]+\/forced-command-gateway\.sh" ssh-ed25519 /);

    const installedGateway = path.join(home, '.local/lib/resumepilot-deploy/forced-command-gateway.sh');
    const runner = process.platform === 'win32' || installedGateway.endsWith('.sh') ? bashBin : installedGateway;
    const runnerArgs = runner === bashBin ? [installedGateway] : [];
    const status = spawnSync(runner, runnerArgs, {
      env: { ...process.env, HOME: home, SSH_ORIGINAL_COMMAND: 'status' },
      encoding: 'utf8',
    });
    assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
    assert.match(status.stdout, /active_sha=0000000000000000000000000000000000000000/);
    assert.match(status.stdout, /pm2_status=online/);

    const arbitrary = spawnSync(runner, runnerArgs, {
      env: { ...process.env, HOME: home, SSH_ORIGINAL_COMMAND: 'id' },
      encoding: 'utf8',
    });
    assert.equal(arbitrary.status, 126);
    assert.match(arbitrary.stderr, /Denied:/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('receiver rejects tampering, activates healthy code, and rolls back interruption or failed health', { timeout: 30_000 }, (t) => {
  if (!hasPython3) {
    t.skip('python3 is required for release receiver integration test');
    return;
  }
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'resumepilot-remote-test-'));
  try {
    const home = path.join(sandbox, 'home');
    const appHome = path.join(home, 'app');
    const backend = path.join(appHome, 'backend');
    const webroot = path.join(appHome, 'domains/example.test/public_html');
    const source = path.join(sandbox, 'source');
    const bundles = path.join(sandbox, 'bundles');
    const fakeBin = path.join(home, 'fake-bin');
    const configDir = path.join(home, '.config/resumepilot-deploy');
    const config = path.join(configDir, 'config');
    const signingPrivateKey = path.join(home, 'release-signing-private.pem');
    const wrongSigningPrivateKey = path.join(home, 'wrong-release-signing-private.pem');
    const signingPublicKey = path.join(configDir, 'release-signing-public.pem');
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(bundles, { recursive: true });
    fs.mkdirSync(fakeBin, { recursive: true });
    const signingKeys = generateKeyPairSync('ed25519');
    const wrongSigningKeys = generateKeyPairSync('ed25519');
    write(signingPrivateKey, signingKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }), 0o600);
    write(wrongSigningPrivateKey, wrongSigningKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }), 0o600);
    write(signingPublicKey, signingKeys.publicKey.export({ type: 'spki', format: 'pem' }), 0o600);

    execFileSync('git', ['init', '-q'], { cwd: source });
    execFileSync('git', ['config', 'user.email', 'receiver-test@example.invalid'], { cwd: source });
    execFileSync('git', ['config', 'user.name', 'Receiver Test'], { cwd: source });
    const firstSha = commitFixture(source, 'first');
    const firstBundle = path.join(bundles, 'first.tar.gz');
    buildBundle(source, firstSha, firstBundle);
    const secondSha = commitFixture(source, 'second');
    const secondBundle = path.join(bundles, 'second.tar.gz');
    buildBundle(source, secondSha, secondBundle);

    const originalSha = 'a'.repeat(40);
    write(path.join(backend, 'COMMIT_SHA'), `${originalSha}\n`);
    write(path.join(backend, 'index.js'), 'console.log("original");');
    write(path.join(backend, 'package.json'), '{}');
    write(path.join(backend, '.env'), 'SERVER_SECRET=preserved\n', 0o600);
    write(path.join(backend, 'email_config.json'), '{"smtp":"preserved"}\n', 0o600);
    write(path.join(backend, 'database/engine_state.json'), '{"engine":"mysql"}\n', 0o600);
    write(path.join(webroot, 'index.html'), '<!doctype html><body>original</body>');
    write(path.join(webroot, 'stale.txt'), 'remove me');
    write(path.join(webroot, '.well-known/provider-token'), 'keep me');

    write(path.join(fakeBin, 'npm'), `#!/usr/bin/env bash
set -e
[[ "\${1:-}" == "ci" ]]
mkdir -p node_modules
printf 'installed' > node_modules/.fixture
`, 0o700);
    write(path.join(fakeBin, 'pm2'), `#!/usr/bin/env bash
case "\${1:-}" in
  pid) printf '12345\\n' ;;
  restart)
    if [[ -f "$HOME/interrupt_on_restart" ]]; then
      rm -f "$HOME/interrupt_on_restart"
      kill -TERM "$PPID"
      sleep 0.1
    fi
    exit 0
    ;;
  save) exit 0 ;;
  *) exit 2 ;;
esac
`, 0o700);
    write(path.join(fakeBin, 'curl'), `#!/usr/bin/env bash
set -e
write_code=false
url=''
for arg in "$@"; do
  [[ "$arg" == '--write-out' ]] && write_code=true
  [[ "$arg" == https://* ]] && url="$arg"
done
sha="$(tr -d '[:space:]' < "$HOME/app/backend/COMMIT_SHA")"
fail=''
[[ ! -f "$HOME/fail_sha" ]] || fail="$(cat "$HOME/fail_sha")"
if $write_code; then
  if [[ "$sha" == "$fail" && "$url" == *'/api/readyz'* ]]; then printf '503'; else printf '200'; fi
elif [[ "$url" == *'/api/healthz'* ]]; then
  if [[ "$sha" == "$fail" ]]; then printf '{"commitSha":"failed"}'; else printf '{"commitSha":"%s"}' "$sha"; fi
elif [[ "$url" == 'https://example.test/' ]]; then
  cat "$HOME/app/domains/example.test/public_html/index.html"
fi
`, 0o700);

    fs.mkdirSync(configDir, { recursive: true });
    write(config, [
      `APP_HOME=${appHome}`,
      `BACKEND_DIR=${backend}`,
      `WEBROOT_DIR=${webroot}`,
      'PUBLIC_URL=https://example.test',
      'PM2_APP=airesume-backend',
      `NODE_BIN=${process.execPath}`,
      `NPM_BIN=${path.join(fakeBin, 'npm')}`,
      `PM2_BIN=${path.join(fakeBin, 'pm2')}`,
      `DEPLOY_STATE_DIR=${path.join(home, '.local/state/resumepilot-deploy')}`,
      `RELEASE_SIGNING_PUBLIC_KEY=${signingPublicKey}`,
      'MAX_BUNDLE_BYTES=268435456',
      'RETAIN_RELEASES=3',
      'VERIFY_ATTEMPTS=1',
      'VERIFY_DELAY_SECONDS=0',
      '',
    ].join('\n'), 0o600);

    const commonEnv = {
      ...process.env,
      HOME: home,
      PATH: `${fakeBin}:/usr/local/bin:/usr/bin:/bin`,
      RESUMEPILOT_DEPLOY_CONFIG: config,
    };
    const firstSignature = signBundle(firstBundle, firstSha, signingPrivateKey);
    const firstBundleBytes = fs.readFileSync(firstBundle);

    const wrongClaimedDigest = spawnSync(receiver, [
      'receive', firstSha, '0'.repeat(64), firstSignature.signature,
    ], {
      input: firstBundleBytes,
      env: commonEnv,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    assert.notEqual(wrongClaimedDigest.status, 0, 'an incorrect claimed bundle digest must be rejected');
    assert.match(`${wrongClaimedDigest.stdout}\n${wrongClaimedDigest.stderr}`, /received bundle digest does not match/);

    const alteredBundleBytes = Buffer.from(firstBundleBytes);
    alteredBundleBytes[alteredBundleBytes.length - 1] ^= 0xff;
    const alteredBundle = spawnSync(receiver, [
      'receive', firstSha, firstSignature.bundle_sha256, firstSignature.signature,
    ], {
      input: alteredBundleBytes,
      env: commonEnv,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    assert.notEqual(alteredBundle.status, 0, 'an altered bundle must be rejected');
    assert.match(`${alteredBundle.stdout}\n${alteredBundle.stderr}`, /received bundle digest does not match/);

    const wrongKeySignature = signBundle(firstBundle, firstSha, wrongSigningPrivateKey);
    const wrongSigningKey = spawnSync(receiver, [
      'receive', firstSha, wrongKeySignature.bundle_sha256, wrongKeySignature.signature,
    ], {
      input: firstBundleBytes,
      env: commonEnv,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    assert.notEqual(wrongSigningKey.status, 0, 'a signature from an untrusted signing key must be rejected');
    assert.match(`${wrongSigningKey.stdout}\n${wrongSigningKey.stderr}`, /signature verification failed/);

    const forged = spawnSync(receiver, [
      'receive', firstSha, firstSignature.bundle_sha256, 'A'.repeat(86),
    ], {
      input: fs.readFileSync(firstBundle),
      env: commonEnv,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    assert.notEqual(forged.status, 0, 'forged release signature must be rejected');
    assert.match(`${forged.stdout}\n${forged.stderr}`, /signature verification failed/);
    assert.equal(fs.readFileSync(path.join(backend, 'COMMIT_SHA'), 'utf8').trim(), originalSha);

    const first = spawnSync(receiver, [
      'receive', firstSha, firstSignature.bundle_sha256, firstSignature.signature,
    ], {
      input: fs.readFileSync(firstBundle),
      env: commonEnv,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    assert.equal(fs.readFileSync(path.join(backend, 'COMMIT_SHA'), 'utf8').trim(), firstSha);
    assert.equal(fs.readFileSync(path.join(backend, '.env'), 'utf8'), 'SERVER_SECRET=preserved\n');
    assert.equal(fs.readFileSync(path.join(backend, 'email_config.json'), 'utf8'), '{"smtp":"preserved"}\n');
    assert.equal(fs.readFileSync(path.join(webroot, '.well-known/provider-token'), 'utf8'), 'keep me');
    assert.match(fs.readFileSync(path.join(webroot, 'index.html'), 'utf8'), /first/);
    assert.equal(fs.existsSync(path.join(webroot, 'stale.txt')), false);
    assert.equal(fs.existsSync(path.join(backend, 'node_modules/.fixture')), true);

    const secondSignature = signBundle(secondBundle, secondSha, signingPrivateKey);
    write(path.join(home, 'interrupt_on_restart'), 'yes\n');
    const interrupted = spawnSync(receiver, [
      'receive', secondSha, secondSignature.bundle_sha256, secondSignature.signature,
    ], {
      input: fs.readFileSync(secondBundle),
      env: commonEnv,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    assert.notEqual(interrupted.status, 0, 'an interrupted activation must fail');
    assert.match(`${interrupted.stdout}\n${interrupted.stderr}`, /interrupted during activation/);
    assert.equal(fs.readFileSync(path.join(backend, 'COMMIT_SHA'), 'utf8').trim(), firstSha);
    assert.match(fs.readFileSync(path.join(webroot, 'index.html'), 'utf8'), /first/);
    assert.equal(fs.existsSync(path.join(home, '.local/state/resumepilot-deploy/deploy.lock')), false);

    write(path.join(home, 'fail_sha'), secondSha);
    const second = spawnSync(receiver, [
      'receive', secondSha, secondSignature.bundle_sha256, secondSignature.signature,
    ], {
      input: fs.readFileSync(secondBundle),
      env: commonEnv,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    assert.notEqual(second.status, 0, 'unhealthy release must fail');
    assert.match(`${second.stdout}\n${second.stderr}`, /rolled back|restoring the pre-release/);
    assert.equal(fs.readFileSync(path.join(backend, 'COMMIT_SHA'), 'utf8').trim(), firstSha);
    assert.match(fs.readFileSync(path.join(webroot, 'index.html'), 'utf8'), /first/);
    assert.doesNotMatch(fs.readFileSync(path.join(webroot, 'index.html'), 'utf8'), /second/);
    assert.equal(fs.readFileSync(path.join(webroot, '.well-known/provider-token'), 'utf8'), 'keep me');
    assert.equal(fs.existsSync(path.join(home, '.local/state/resumepilot-deploy/deploy.lock')), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
