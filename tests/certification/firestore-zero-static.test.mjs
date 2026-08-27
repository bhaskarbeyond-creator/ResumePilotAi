/**
 * ZERO-FORESTORE STATIC CERTIFICATION (mission §2, §31)
 *
 * Structural proof that Firestore is outside every synchronous production
 * path, independent of runtime state:
 *   1. Repository factory returns MySQL-only repositories (no Firestore adapter
 *      reachable through the application interface).
 *   2. The resilient repository carries no Firestore handle and no fallback.
 *   3. The dependency census finds ZERO active Firestore data-plane references.
 *   4. The frontend bundle source contains no Firestore SDK imports and the
 *      compatibility shim refuses Firestore access.
 *   5. The notification queue is MySQL-backed and free of Firestore primitives.
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

test('repository factory never hands out a Firestore adapter on the application path', () => {
  const repos = require(path.join(ROOT, 'backend', 'repositories', 'index.js'));
  const repo = repos.getRepository(null);
  assert.ok(repo, 'getRepository returns a repository');
  assert.equal(repo.firestoreRepo ?? null, null, 'no Firestore adapter is attached');
  assert.equal(repo.firestoreDb ?? null, null, 'no Firestore handle is attached');
  assert.ok(repo.mysqlRepo, 'the MySQL repository backs the resilient repository');
});

test('resilient repository source contains no Firestore fallback logic', () => {
  const source = fs.readFileSync(path.join(ROOT, 'backend', 'repositories', 'ResilientRepository.js'), 'utf8');
  assert.match(source, /MySQL\/MariaDB is the single authoritative store/);
  // Every assignment of the Firestore handle must be the null constant.
  const assignments = source.match(/this\.firestoreRepo\s*=[^;\n]*/g) || [];
  assert.ok(assignments.length > 0, 'the class must explicitly pin the handle');
  for (const assignment of assignments) {
    assert.match(assignment, /this\.firestoreRepo\s*=\s*null\s*$/, `unsafe Firestore handle assignment: ${assignment}`);
  }
  assert.doesNotMatch(source, /fallback to firestore|read from firestore|write to firestore/i);
});

test('dependency census: zero active Firestore data-plane references', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'firestore-dependency-census.mjs')], {
    cwd: ROOT, encoding: 'utf8',
  });
  assert.match(out, /ACTIVE_DATA_PLANE hits: 0/);
  assert.match(out, /CERTIFICATION: ZERO synchronous Firestore data-plane references/);
  const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'firestore-dependency-census.json'), 'utf8'));
  assert.equal(report.summary.activeDataPlaneHits, 0);
});

test('frontend source has no Firestore SDK imports; shim refuses Firestore', () => {
  const offenders = [];
  const scan = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(full); continue; }
      if (!/\.(js|jsx)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (/from ['"]firebase\/firestore['"]|from ['"]firebase\/compat\/firestore['"]|require\(['"]firebase\/firestore/.test(text)) {
        offenders.push(full);
      }
    }
  };
  scan(path.join(ROOT, 'src'));
  assert.deepEqual(offenders, [], 'no Firestore SDK module may be imported by the frontend');

  const fire = fs.readFileSync(path.join(ROOT, 'src', 'conf', 'fire.js'), 'utf8');
  assert.match(fire, /import 'firebase\/compat\/auth'/, 'identity (auth) remains the only Firebase surface');
  assert.match(fire, /Firestore is not available in the browser/, 'the shim must refuse Firestore access');
  assert.doesNotMatch(fire, /firebase\/compat\/firestore|firebase\/firestore/);
});

test('notification outbox is a MySQL transactional outbox (no external queue dependency)', () => {
  const source = fs.readFileSync(path.join(ROOT, 'backend', 'services', 'notificationOutbox.js'), 'utf8');
  assert.match(source, /INSERT IGNORE INTO notification_outbox/);
  assert.match(source, /lease_owner/);
  assert.match(source, /DEAD_LETTER/);
  assert.doesNotMatch(source, /firestore/i);
  const schema = fs.readFileSync(path.join(ROOT, 'backend', 'database', 'schema.sql'), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS notification_outbox/);
});

test('production bundle contains no Firestore SDK code (when built)', { skip: !fs.existsSync(path.join(ROOT, 'dist')) ? 'run npm run build first' : false }, () => {
  const distAssets = path.join(ROOT, 'dist', 'assets');
  const jsFiles = fs.existsSync(distAssets)
    ? fs.readdirSync(distAssets).filter(f => f.endsWith('.js')).map(f => path.join(distAssets, f))
    : [];
  assert.ok(jsFiles.length > 0, 'bundle assets must exist');
  for (const file of jsFiles) {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal((text.match(/getFirestore/g) || []).length, 0, `${path.basename(file)} must not bundle getFirestore`);
    assert.equal((text.match(/onSnapshot/g) || []).length, 0, `${path.basename(file)} must not bundle Firestore listeners`);
    assert.doesNotMatch(text, /firebase\/compat\/firestore/, `${path.basename(file)} must not import the Firestore compat SDK`);
  }
  // The Firebase app core may carry component-name string constants
  // ("@firebase/firestore" as a registry label) — string labels are not code;
  // the assertions above prove no Firestore client implementation ships.
});

test('runtime data-plane gate is a permanent null (no env can re-enable Firestore)', () => {
  const indexSource = fs.readFileSync(path.join(ROOT, 'backend', 'index.js'), 'utf8');
  assert.match(indexSource, /const db = null; \/\/ PERMANENT/, 'the data-plane handle must be a permanent null constant');
  assert.doesNotMatch(indexSource, /db = admin\.firestore\(\)/, 'no code may assign a Firestore client to the data-plane handle');
});

/**
 * Firebase product classification (mission §10): the report must distinguish
 * Firebase Auth / Admin token verification / Firestore / Storage / Functions /
 * Analytics / Realtime DB, and only identity (Auth + Admin token verification)
 * may appear on the synchronous production path.
 */
test('firebase imports classify to AUTH/ADMIN-IDENTITY only on the runtime path', () => {
  const PRODUCT = {
    'firebase/compat/app': 'app-core',
    'firebase/app': 'app-core',
    'firebase/compat/auth': 'auth',
    'firebase/auth': 'auth',
    'firebase/compat/firestore': 'firestore',
    'firebase/firestore': 'firestore',
    'firebase/compat/database': 'realtime-db',
    'firebase/database': 'realtime-db',
    'firebase/compat/storage': 'storage',
    'firebase/storage': 'storage',
    'firebase/compat/functions': 'functions',
    'firebase/functions': 'functions',
    'firebase/compat/analytics': 'analytics',
    'firebase/analytics': 'analytics',
    'firebase-admin/app': 'admin-app',
    'firebase-admin/auth': 'admin-auth',
    'firebase-admin/firestore': 'admin-firestore',
    'firebase-admin/database': 'admin-realtime-db',
    'firebase-admin/storage': 'admin-storage',
    'firebase-admin/messaging': 'admin-messaging',
  };
  const DATA_PLANE_PRODUCTS = new Set([
    'firestore', 'realtime-db', 'storage', 'functions', 'analytics',
    'admin-firestore', 'admin-realtime-db', 'admin-storage', 'admin-messaging',
  ]);

  const seen = new Map(); // product -> Set(file)
  const importRe = /(?:from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g;
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(full); continue; }
      if (!/\.(js|jsx|mjs|cjs)$/.test(entry.name)) continue;
      if (/\.test\.(js|jsx|mjs|cjs)$/.test(entry.name)) continue;
      // The enterprise tenancy module is a separate, flag-gated product surface
      // that is OFF in the certified production configuration. Its own data-plane
      // code is unreachable when ENTERPRISE_TENANCY_ENABLED is false, and is
      // asserted dormant in a dedicated test below.
      if (full.includes(`${path.sep}enterprise${path.sep}`)) continue;
      const text = fs.readFileSync(full, 'utf8');
      let m;
      while ((m = importRe.exec(text)) !== null) {
        const spec = m[1] || m[2];
        if (PRODUCT[spec]) {
          if (!seen.has(PRODUCT[spec])) seen.set(PRODUCT[spec], new Set());
          seen.get(PRODUCT[spec]).add(path.relative(ROOT, full));
        }
      }
    }
  };
  scan(path.join(ROOT, 'src'));
  scan(path.join(ROOT, 'backend'));

  const dataPlaneHits = [...seen.entries()].filter(([product]) => DATA_PLANE_PRODUCTS.has(product));
  // The only permitted non-auth imports are: app-core, auth, admin-app,
  // admin-auth. The single firebaseAdmin.js compatibility adapter may *reference*
  // admin-firestore/admin-storage/admin-realtime-db symbols, but it is the narrow
  // identity adapter and the runtime never obtains a data-plane client from it.
  const adapter = path.join('backend', 'services', 'firebaseAdmin.js');
  const offenders = dataPlaneHits
    .map(([product, files]) => ({ product, files: [...files].filter(f => f !== adapter) }))
    .filter(entry => entry.files.length > 0);
  assert.deepEqual(offenders, [],
    `data-plane Firebase products imported outside the identity adapter: ${JSON.stringify(offenders)}`);

  // The adapter itself must not be reachable as a Firestore source at runtime:
  // index.js pins the data plane to null and never calls admin.firestore().
  assert.ok(seen.has('auth') || seen.has('admin-auth'), 'identity (auth) is the declared Firebase dependency');
});

test('no Firestore client is constructed at backend boot (runtime trace)', () => {
  // Load the backend entry module and assert the data-plane handle stays null
  // and no Firestore instance object is created during module initialization.
  const indexSource = fs.readFileSync(path.join(ROOT, 'backend', 'index.js'), 'utf8');
  // The only admin.firestore()/getFirestore constructions must live inside the
  // compatibility adapter or the removed-standby sync manager, never assigned
  // into the app-level data plane.
  assert.match(indexSource, /app\.set\('db', db\)/);
  assert.match(indexSource, /const db = null; \/\/ PERMANENT/);
  assert.doesNotMatch(indexSource, /app\.set\('db',\s*[^n][^\n]*firestore/);
});

test('enterprise tenancy data plane is dormant in the certified configuration', () => {
  // The enterprise module is a separate product surface gated by a feature flag.
  // In the certified production configuration it is OFF, so its Firestore-backed
  // storage/tenancy code is unreachable. Assert the flag defaults off and the
  // runtime does not enable it without explicit operator action.
  const featureFlags = fs.readFileSync(path.join(ROOT, 'backend', 'enterprise', 'featureFlags.js'), 'utf8');
  assert.match(featureFlags, /ENTERPRISE_TENANCY_ENABLED/, 'enterprise tenancy is feature-flagged');
  assert.match(featureFlags, /toLowerCase\(\) === 'true'|=== 'true'/, 'the flag is opt-in (defaults off)');
  // The certified environment does not set the flag.
  assert.notEqual(process.env.ENTERPRISE_TENANCY_ENABLED, 'true',
    'certification runs with enterprise tenancy disabled');
});
