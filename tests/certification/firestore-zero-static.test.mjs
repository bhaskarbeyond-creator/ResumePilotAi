/**
 * Firebase application-data elimination certification.
 *
 * Firebase Authentication remains the identity plane. This suite fails closed
 * if Firestore, Realtime Database, Storage, Functions, Analytics, Messaging, or
 * another Firebase data product is imported, constructed, configured, bundled,
 * or exposed through a legacy application adapter.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function filesBelow(directory, predicate = () => true) {
  const output = [];
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...filesBelow(absolute, predicate));
    else if (predicate(absolute)) output.push(absolute);
  }
  return output;
}

test('fail-closed census scans all runtime roots with no path exemptions', () => {
  const output = execFileSync(process.execPath, [
    path.join(ROOT, 'scripts', 'firestore-dependency-census.mjs'), '--check',
  ], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  assert.match(output, /prohibited production hits: 0/);
  assert.match(output, /path-based runtime exemptions: 0/);
  assert.match(output, /Firebase Authentication is the only Firebase production surface/);
});

test('application repository graph has one MariaDB owner and no retired adapters', () => {
  const repositories = require(path.join(ROOT, 'backend', 'repositories', 'index.js'));
  repositories.resetRepositoryCacheForTests();
  const repository = repositories.getRepository();
  assert.ok(repository.mysqlRepo, 'the resilient boundary delegates to MariaDB');
  assert.equal(Object.hasOwn(repository, 'firestoreRepo'), false);
  assert.equal(Object.hasOwn(repository, 'firestoreDb'), false);

  const resilient = read('backend/repositories/ResilientRepository.js');
  assert.match(resilient, /MySQL\/MariaDB is the single authoritative store/);
  assert.doesNotMatch(resilient, /fallback to firestore|read from firestore|write to firestore/i);

  const removed = [
    'backend/repositories/FirestoreRepository.js',
    'backend/database/syncManager.js',
    'backend/enterprise/firestoreEnterpriseRepository.js',
    'backend/enterprise/firebaseMigrationAdapter.js',
    'backend/enterprise/firebaseBridge.js',
    'src/identity/accountProfile.js',
    'src/data/applicationData.js',
    'src/firestore/paidOperations.js',
  ];
  for (const relative of removed) assert.equal(fs.existsSync(path.join(ROOT, relative)), false, `${relative} must remain absent`);
});

test('Firebase Admin compatibility module is identity-only by construction', () => {
  const source = read('backend/services/firebaseAdmin.js');
  assert.match(source, /firebase-admin\/app/);
  assert.match(source, /firebase-admin\/auth/);
  assert.doesNotMatch(source, /firebase-admin\/(?:firestore|database|storage|messaging|functions)/);
  assert.doesNotMatch(source, /\b(?:getFirestore|getDatabase|getStorage|getMessaging)\b/);

  const adapter = require(path.join(ROOT, 'backend', 'services', 'firebaseAdmin.js'));
  for (const forbidden of ['firestore', 'database', 'storage', 'messaging']) {
    assert.equal(Object.hasOwn(adapter, forbidden), false, `${forbidden} must not be exposed by the identity adapter`);
  }
  assert.equal(typeof adapter.auth, 'function');
});

test('browser Firebase bootstrap imports Auth only and offers no data client', () => {
  const source = read('src/conf/fire.js');
  assert.match(source, /firebase\/compat\/app/);
  assert.match(source, /firebase\/compat\/auth/);
  assert.doesNotMatch(source, /firebase\/(?:compat\/)?(?:firestore|database|storage|functions|analytics|messaging)/);
  assert.doesNotMatch(source, /\b(?:getFirestore|getDatabase|getStorage|onSnapshot)\b/);
});

test('Firebase deployment configuration contains only the retained Auth emulator', () => {
  const config = JSON.parse(read('firebase.json'));
  assert.deepEqual(Object.keys(config).sort(), ['emulators']);
  assert.deepEqual(Object.keys(config.emulators).sort(), ['auth', 'ui']);
  assert.equal(config.emulators.auth.port, 9099);

  const retiredArtifacts = [
    'SecurityRules.txt',
    'Realtime_database_Security_rules.txt',
    'firestore.indexes.json',
    'updated-firestore-rules.txt',
  ];
  for (const relative of retiredArtifacts) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), false, `${relative} must not configure a retired Firebase data product`);
  }

  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.devDependencies?.['@firebase/rules-unit-testing'], undefined);
  assert.equal(manifest.dependencies?.['@firebase/rules-unit-testing'], undefined);
});

test('enterprise tenancy is included in the MariaDB-only certification surface', () => {
  const factory = read('backend/enterprise/enterpriseRepository.js');
  const service = read('backend/enterprise/tenantService.js');
  const flags = read('backend/enterprise/featureFlags.js');
  assert.match(factory, /mysql|mariadb/i);
  assert.doesNotMatch(factory, /firestore/i);
  assert.doesNotMatch(service, /firestore/i);
  assert.doesNotMatch(flags, /dataProvider|firestore/i);

  const runtimeEnterpriseFiles = filesBelow(path.join(ROOT, 'backend', 'enterprise'), file => /\.(?:js|cjs|mjs)$/.test(file));
  assert.ok(runtimeEnterpriseFiles.length > 0);
  for (const file of runtimeEnterpriseFiles) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /firebase-admin\/firestore|firebase\/firestore|admin\.firestore\s*\(|getFirestore\s*\(/i, path.relative(ROOT, file));
  }
});

test('durable queues are MariaDB transactional outboxes', () => {
  const notification = read('backend/services/notificationOutbox.js');
  const enterprise = read('backend/enterprise/enterpriseOutbox.js');
  for (const [name, source] of [['notification', notification], ['enterprise', enterprise]]) {
    assert.match(source, /INSERT INTO (?:notification_outbox|enterprise_outbox)/, `${name} queue must persist in MariaDB`);
    assert.match(source, /DEAD_LETTER/, `${name} queue must expose terminal dead-letter state`);
    assert.doesNotMatch(source, /firestore/i, `${name} queue must not reference Firestore`);
  }
});

test('fresh production bundle contains no Firebase data-product client or endpoint', { timeout: 240_000 }, () => {
  const outputDirectory = path.join(ROOT, '.arena', 'firestore-certification-bundle');
  fs.rmSync(outputDirectory, { recursive: true, force: true });
  try {
    execFileSync(process.execPath, [
      path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      'build', '--outDir', outputDirectory, '--emptyOutDir',
    ], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 220_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    const bundles = filesBelow(outputDirectory, file => file.endsWith('.js'));
    assert.ok(bundles.length > 0, 'Vite must emit JavaScript bundles for inspection');
    const forbidden = [
      ['get', 'Firestore'].join(''),
      ['on', 'Snapshot'].join(''),
      ['connect', 'Firestore', 'Emulator'].join(''),
      ['firestore', '.googleapis.com'].join(''),
      ['firebaseio', '.com'].join(''),
      ['firebasestorage', '.googleapis.com'].join(''),
    ];
    const offenders = [];
    for (const file of bundles) {
      const source = fs.readFileSync(file, 'utf8');
      for (const token of forbidden) {
        if (source.includes(token)) offenders.push(`${path.relative(outputDirectory, file)}: ${token}`);
      }
    }
    assert.deepEqual(offenders, []);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});
